/**
 * Twitter监控模块
 * 基于现有monitor.js重构的模块化Twitter监控器
 */
import { BaseMonitor } from '../base/BaseMonitor.js';
import { TwitterScheduler } from './TwitterScheduler.js';
import { TwitterConfig } from './TwitterConfig.js';
import { TwitterApiClient, XAuthenticator } from './TwitterApiClient.js';
import fs from 'fs';
import path from 'path';

export class TwitterMonitor extends BaseMonitor {
    constructor(sharedServices, config) {
        super('twitter', sharedServices, config);

        this.twitterConfig = new TwitterConfig(config);
        this.apiClients = new Map();
        this.dataDir = './data/monitor';
        this.scheduler = null;

        // 初始化数据目录
        this.initializeDataStorage();
    }

    /**
     * 子类初始化方法
     */
    async onInitialize() {
        try {
            // 初始化Twitter配置
            if (!this.twitterConfig.validate()) {
                throw new Error('Twitter配置验证失败');
            }

            // 初始化API客户端
            const credentials = this.twitterConfig.getApiCredentials();

            for (const credential of credentials) {
                const client = new TwitterApiClient(credential, this.getDatabase());
                await client.initialize();
                this.apiClients.set(credential.xUserName, client);
            }

            // 创建调度器
            this.scheduler = new TwitterScheduler(this, this.config);

            this.logger.info('Twitter监控模块初始化完成');

        } catch (error) {
            this.logger.error('Twitter监控模块初始化失败', { error: error.message });
            throw error;
        }
    }

    /**
     * 子类启动方法
     */
    async onStart() {
        // 启动调度器
        if (this.scheduler) {
            await this.scheduler.start();
        }

        this.logger.info('Twitter监控模块启动完成');
    }

    /**
     * 子类停止方法
     */
    async onStop() {
        try {
            // 停止调度器
            if (this.scheduler) {
                await this.scheduler.stop();
            }

            // 关闭所有API客户端
            if (this.apiClients) {
                for (const client of this.apiClients.values()) {
                    await client.close();
                }
                this.apiClients.clear();
            }

            this.logger.info('Twitter监控模块停止完成');

        } catch (error) {
            this.logger.error('Twitter监控模块停止失败', { error: error.message });
        }
    }

    /**
     * 子类配置验证方法
     */
    onValidateConfig() {
        if (!this.config.apiCredentials || this.config.apiCredentials.length === 0) {
            this.logger.error('Twitter模块缺少API凭证配置');
            return false;
        }

        return true;
    }

    /**
     * 子类健康检查方法
     */
    async onHealthCheck() {
        // 检查调度器状态
        if (this.scheduler && !this.scheduler.isRunning) {
            return false;
        }

        // 检查数据库连接
        const database = this.getDatabase();
        if (database && !database.isHealthy()) {
            return false;
        }

        return true;
    }

    /**
     * 初始化数据存储目录
     */
    initializeDataStorage() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }

            const subDirs = ['tweets', 'logs'];
            subDirs.forEach(dir => {
                const dirPath = path.join(this.dataDir, dir);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
            });

            this.logger.info('Twitter数据存储目录初始化完成');
        } catch (error) {
            this.logger.error('初始化数据存储目录失败', { error: error.message });
        }
    }



    /**
     * 手动触发监控检查
     */
    async manualCheck() {
        this.logger.info('手动触发Twitter监控检查');

        try {
            return await this.performMonitoringCheck();
        } catch (error) {
            this.logger.error('手动检查失败', { error: error.message });
            throw error;
        }
    }

    /**
     * 获取API客户端统计信息
     * @returns {Array} API客户端统计
     */
    getApiClientsStats() {
        const stats = [];

        for (const [username, client] of this.apiClients.entries()) {
            stats.push({
                username,
                ...client.getRequestStats(),
                isInitialized: client.isInitialized
            });
        }

        return stats;
    }

    /**
     * 重置所有API客户端的请求计数
     */
    resetAllRequestCounts() {
        for (const client of this.apiClients.values()) {
            client.resetRequestCount();
        }
        this.logger.info('已重置所有API客户端的请求计数');
    }

    /**
     * 执行Twitter监控检查
     * @returns {Promise<Object>} 检查结果
     */
    async performMonitoringCheck() {
        try {
            this.logger.info('开始执行Twitter监控检查');

            const results = {
                totalChecked: 0,
                newTweets: 0,
                errors: 0,
                apiStats: []
            };

            // 遍历所有API客户端进行检查
            for (const [username, client] of this.apiClients.entries()) {
                try {
                    const checkResult = await this.checkUserTweets(client);
                    results.totalChecked++;
                    results.newTweets += checkResult.newTweets;
                    results.apiStats.push({
                        username,
                        ...checkResult,
                        ...client.getRequestStats()
                    });
                } catch (error) {
                    this.logger.error(`检查用户推文失败: ${username}`, { error: error.message });
                    results.errors++;
                    results.apiStats.push({
                        username,
                        error: error.message,
                        newTweets: 0
                    });
                }
            }

            this.updateStatistics('success');
            this.logger.info('Twitter监控检查完成', results);
            return results;

        } catch (error) {
            this.logger.error('Twitter监控检查失败', { error: error.message });
            this.updateStatistics('error');
            throw error;
        }
    }

    /**
     * 检查单个用户的推文
     * @param {TwitterApiClient} client - API客户端
     * @returns {Promise<Object>} 检查结果
     */
    async checkUserTweets(client) {
        try {
            const credential = client.credentials;
            const monitorUser = credential.monitorUser;

            // 获取上次检查的时间
            const database = this.getDatabase();
            const lastState = await database.getMonitorState(monitorUser, 'twitter');
            const lastCheckTime = lastState?.last_check_time;

            // 获取新推文（使用时间范围而不是推文ID）
            const tweets = await client.getUserTweets(monitorUser, lastCheckTime);

            let newTweets = 0;
            let latestTweetTime = lastCheckTime;

            // 处理每条推文
            for (const tweet of tweets) {
                try {
                    // 保存推文到数据库
                    const saved = await database.saveTweet({
                        tweet_id: tweet.id,
                        user_id: tweet.author_id,
                        username: monitorUser,
                        content: tweet.text,
                        created_at: new Date(tweet.createdAt),
                        monitor_user: monitorUser,
                        url: tweet.url,
                        metrics: tweet.metrics
                    });

                    if (saved) {
                        newTweets++;

                        // 更新最新推文时间
                        const tweetTime = new Date(tweet.createdAt);
                        if (!latestTweetTime || tweetTime > new Date(latestTweetTime)) {
                            latestTweetTime = tweet.createdAt;
                        }

                        // 发送通知
                        await this.sendTweetNotification(tweet, monitorUser);
                    }
                } catch (error) {
                    this.logger.error(`处理推文失败: ${tweet.id}`, { error: error.message });
                }
            }

            // 更新监控状态
            if (tweets.length > 0) {
                await database.updateMonitorState(monitorUser, 'twitter', {
                    last_check_time: latestTweetTime || new Date().toISOString(),
                    last_update_time: new Date()
                });
            }

            return {
                monitorUser,
                newTweets,
                totalTweets: tweets.length,
                latestTweetTime
            };

        } catch (error) {
            this.logger.error(`检查用户推文失败: ${client.credentials.monitorUser}`, { error: error.message });
            throw error;
        }
    }



    /**
     * 发送推文通知
     * @param {Object} tweet - 推文对象
     * @param {string} monitorUser - 监控用户
     */
    async sendTweetNotification(tweet, monitorUser) {
        try {
            const notifier = this.getNotifier();
            if (!notifier) {
                this.logger.warn('通知器未配置，跳过通知发送');
                return;
            }

            const tweetData = {
                username: monitorUser,
                content: tweet.text,
                created_at: tweet.createdAt,
                tweet_id: tweet.id,
                url: tweet.url || `https://twitter.com/${monitorUser}/status/${tweet.id}`
            };

            const result = await notifier.sendNotification('twitter', tweetData);

            if (result.success) {
                this.logger.info(`Twitter通知发送成功: ${tweet.id}`);
            } else {
                this.logger.error(`Twitter通知发送失败: ${result.error}`);
            }

        } catch (error) {
            this.logger.error('处理Twitter通知时出错', { error: error.message });
        }
    }

    /**
     * 获取监控统计信息
     * @returns {Object} 统计信息
     */
    getMonitoringStats() {
        const baseStats = this.getStatistics();

        return {
            ...baseStats,
            isTestMode: this.twitterConfig.isTestMode(),
            testInterval: this.twitterConfig.getTestInterval(),
            dailyRequestsPerApi: this.twitterConfig.getDailyRequestsPerApi(),
            apiClients: this.getApiClientsStats(),
            scheduler: this.scheduler ? this.scheduler.getStatus() : null
        };
    }

    /**
     * 获取监控用户昵称列表
     * @returns {Array<string>} 用户昵称列表
     */
    getMonitoredUserNicknames() {
        const userMap = new Map();
        
        for (const [username, client] of this.apiClients.entries()) {
            const monitorUser = client.credentials.monitorUser;
            if (!userMap.has(monitorUser)) {
                userMap.set(monitorUser, true);
            }
        }
        
        return Array.from(userMap.keys());
    }

    /**
     * 根据昵称获取用户配置
     * @param {string} nickname - 用户昵称
     * @returns {Object|null} 用户配置
     */
    getUserByNickname(nickname) {
        const credentials = this.twitterConfig.getApiCredentials();
        const userCredentials = credentials.filter(
            cred => cred.monitorUser === nickname
        );
        
        if (userCredentials.length === 0) {
            return null;
        }
        
        return {
            xMonitorNickName: nickname,
            apiCredentials: userCredentials.map(cred => ({
                id: cred.xUserName,
                xClientId: cred.xClientId,
                xClientSecret: cred.xClientSecret,
                xRedirectUri: cred.xRedirectUri,
                xUserName: cred.xUserName,
                bitbrowserId: cred.bitbrowserId,
                socksProxyUrl: cred.socksProxyUrl
            }))
        };
    }

    /**
     * 监控单个用户（调度器调用）
     * @param {string} nickname - 用户昵称
     * @param {number} credentialIndex - 凭证索引
     */
    async monitorUser(nickname, credentialIndex) {
        try {
            this.logger.info(`开始监控用户: ${nickname}, 凭证索引: ${credentialIndex}`);

            // 找到对应的API客户端
            const credentials = this.twitterConfig.getApiCredentials();
            const userCredentials = credentials.filter(cred => cred.monitorUser === nickname);
            
            if (userCredentials.length === 0) {
                throw new Error(`未找到用户 ${nickname} 的凭证`);
            }

            const credentialIndex_safe = credentialIndex % userCredentials.length;
            const credential = userCredentials[credentialIndex_safe];
            const client = this.apiClients.get(credential.xUserName);
            
            if (!client) {
                throw new Error(`未找到用户 ${credential.xUserName} 的API客户端`);
            }

            // 执行监控检查
            const result = await this.checkUserTweets(client);
            
            this.logger.info(`用户监控完成: ${nickname}, 新推文: ${result.newTweets}`);
            return result;

        } catch (error) {
            this.logger.error(`监控用户失败: ${nickname}`, { error: error.message });
            this.updateStatistics('error');
            throw error;
        }
    }

    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}