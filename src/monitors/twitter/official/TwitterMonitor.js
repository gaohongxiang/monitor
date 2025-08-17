/**
 * Twitter监控模块 - 重构版
 * 采用模块化架构，职责分离，提高可维护性
 */
import { BaseMonitor } from '../../base/BaseMonitor.js';
import { TwitterScheduler } from './TwitterScheduler.js';
import { TwitterConfigManager } from './config/TwitterConfigManager.js';
import { TwitterApiClient } from './api/TwitterApiClient.js';
import { TwitterUserHandler } from './handlers/TwitterUserHandler.js';
import { TwitterNotificationHandler } from './handlers/TwitterNotificationHandler.js';
import { TwitterSharedService } from '../shared/index.js';
import fs from 'fs';
import path from 'path';

export class TwitterMonitor extends BaseMonitor {
    constructor(sharedServices, config) {
        // config参数现在直接是Twitter模块的配置
        super('twitter-official', sharedServices, config);

        // 初始化配置管理器
        this.configManager = new TwitterConfigManager(config);

        // 初始化核心组件
        this.apiClients = new Map();
        this.dataDir = './data/monitor';
        this.scheduler = null;
        this.lastTweetIds = new Map(); // 存储每个用户的最后推文ID

        // 初始化共享服务
        this.twitterService = new TwitterSharedService();

        // 初始化处理器
        this.userHandler = new TwitterUserHandler(this.twitterService, this.apiClients);
        this.notificationHandler = new TwitterNotificationHandler(sharedServices, this.twitterService);

        // 初始化数据目录
        this.initializeDataStorage();
    }

    /**
     * 子类初始化方法
     */
    async onInitialize() {
        try {
            // 初始化共享服务
            await this.twitterService.initialize();

            // 从数据库恢复最后推文ID
            const monitoredUsers = this.configManager.getMonitoredUsers();
            this.lastTweetIds = await this.twitterService.loadLastTweetIdsFromDatabase(monitoredUsers);

            // 初始化Twitter配置
            if (!this.configManager.validate()) {
                console.log('');
                console.log('🚨 Twitter模块配置不完整！');
                console.log('📋 请按以下步骤完成配置：');
                console.log('');
                console.log('1️⃣ 确保已配置Twitter API凭证：');
                console.log('   - TWITTER_CLIENT_ID');
                console.log('   - TWITTER_CLIENT_SECRET');
                console.log('   - API_CREDENTIALS (JSON格式)');
                console.log('');
                console.log('2️⃣ 启动BitBrowser指纹浏览器');
                console.log('');
                console.log('3️⃣ 进行刷新令牌认证：');
                console.log('   npm run twitter:refresh-token:auth');
                console.log('');
                console.log('4️⃣ 认证完成后重新启动系统：');
                console.log('   npm run dev');
                console.log('');
                console.log('📚 详细配置步骤请参考：src/monitors/twitter/README.md');
                console.log('');
                throw new Error('Twitter配置验证失败 - 需要先完成API凭证配置和OAuth认证');
            }

            // 初始化API客户端
            const credentials = this.configManager.getApiCredentials();

            for (const credential of credentials) {
                const client = new TwitterApiClient(credential, this.getDatabase());

                try {
                    await client.initialize();
                    this.apiClients.set(credential.twitterUserName, client);
                } catch (error) {
                    if (error.message.includes('refreshToken')) {
                        console.log('');
                        console.log('🔐 检测到Twitter认证问题！');
                        console.log(`👤 用户: ${credential.monitorUser}`);
                        console.log('');
                        console.log('🛠️ 解决步骤：');
                        console.log('1. 确保BitBrowser指纹浏览器已启动');
                        console.log('2. 进行刷新令牌认证: npm run twitter:refresh-token:auth');
                        console.log('3. 完成OAuth认证流程');
                        console.log('4. 重新启动系统: npm run dev');
                        console.log('');
                        console.log('📚 详细说明请参考: src/monitors/twitter/README.md');
                        console.log('');
                    }
                    throw error;
                }
            }

            // 创建调度器
            this.scheduler = new TwitterScheduler(this, this.config);

            this.logger.info('Twitter监控模块初始化完成');

        } catch (error) {
            // 如果是配置验证失败，错误信息已经在上面显示了，这里不重复显示
            if (!error.message.includes('Twitter配置验证失败')) {
                this.logger.error('Twitter监控模块初始化失败', { error: error.message });
            }
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
            // 使用用户处理器检查推文
            const checkResult = await this.userHandler.checkUserTweets(client);

            if (!checkResult.success) {
                return {
                    monitorUser: checkResult.username,
                    success: false,
                    reason: checkResult.reason,
                    newTweets: 0,
                    totalTweets: 0
                };
            }

            // 如果有新推文，使用通知处理器处理
            if (checkResult.tweets && checkResult.tweets.length > 0) {
                const notificationResult = await this.notificationHandler.processTweetNotifications(
                    checkResult.username,
                    checkResult.tweets,
                    checkResult.userInfo,
                    this.lastTweetIds
                );

                return {
                    monitorUser: checkResult.username,
                    success: true,
                    newTweets: notificationResult.processed,
                    sentNotifications: notificationResult.sent,
                    skippedNotifications: notificationResult.skipped,
                    latestTweetId: notificationResult.lastTweetId
                };
            }

            return {
                monitorUser: checkResult.username,
                success: true,
                newTweets: 0,
                sentNotifications: 0
            };

        } catch (error) {
            this.logger.error(`检查用户推文失败: ${client.credentials.monitorUser}`, { error: error.message });
            throw error;
        }
    }



    /**
     * 发送推文通知（兼容共享服务接口）
     * @param {string} username - 用户名
     * @param {Object} formattedTweet - 格式化的推文对象
     * @param {Object} userInfo - 用户信息
     */
    async sendTweetNotification(username, formattedTweet, userInfo) {
        // 委托给通知处理器
        await this.notificationHandler.sendTweetNotification(username, formattedTweet, userInfo);
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
        // 使用配置管理器获取监控用户列表
        return this.configManager.getMonitoredUsers();
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
            twitterMonitorNickName: nickname,
            apiCredentials: userCredentials.map(cred => ({
                id: cred.twitterUserName,
                twitterClientId: cred.twitterClientId,
                twitterClientSecret: cred.twitterClientSecret,
                twitterRedirectUri: cred.twitterRedirectUri,
                twitterUserName: cred.twitterUserName,
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
            const client = this.apiClients.get(credential.twitterUserName);

            if (!client) {
                throw new Error(`未找到用户 ${credential.twitterUserName} 的API客户端`);
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