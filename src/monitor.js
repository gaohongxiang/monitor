import { XClient, XAuthenticator } from './x.js';
import { configManager } from './config.js';
import { scheduleManager } from './scheduler.js';
import { dingdingNotifier } from './notifier.js';
import { databaseManager } from './database.js';
import fs from 'fs';
import path from 'path';

/**
 * Twitter监控管理器
 * 负责管理多个用户的监控任务和API凭证轮换
 */
export class xMonitorManager {
    constructor() {
        this.activeClients = new Map(); // 存储活跃的客户端实例
        this.lastTweetIds = new Map(); // 存储每个用户的最后推文ID
        this.monitorStats = new Map(); // 监控统计数据
        this.dataDir = './data/monitor'; // 数据存储目录
        this.isMonitoring = false; // 监控状态
        this.monitorInterval = null; // 监控定时器
        this.scheduleManager = scheduleManager; // 引用调度管理器

        // 初始化数据目录和加载历史数据
        this.initializeDataStorage();
        this.loadHistoricalData();
    }

    /**
     * 初始化数据存储目录
     */
    initializeDataStorage() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }

            // 创建子目录
            const subDirs = ['tweets', 'logs'];
            subDirs.forEach(dir => {
                const dirPath = path.join(this.dataDir, dir);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
            });

            console.log('数据存储目录初始化完成');
        } catch (error) {
            console.error('初始化数据存储目录失败:', error);
        }
    }

    /**
     * 加载历史数据（从数据库）
     */
    async loadHistoricalData() {
        try {
            // 从数据库加载数据
            await this.loadDataFromDatabase();
        } catch (error) {
            console.error('加载历史数据失败:', error);
        }
    }

    /**
     * 从数据库加载数据
     */
    async loadDataFromDatabase() {
        try {
            if (!databaseManager.isHealthy()) {
                console.log('数据库未连接，跳过数据库数据加载');
                return;
            }

            // 加载所有用户的监控状态
            const userNicknames = configManager.getMonitoredUserNicknames();
            for (const nickname of userNicknames) {
                // 加载最后推文ID
                const monitorState = await databaseManager.getMonitorState(nickname);
                if (monitorState && monitorState.last_tweet_id) {
                    this.lastTweetIds.set(nickname, monitorState.last_tweet_id);
                }

                // 加载监控统计
                const stats = await databaseManager.getMonitorStats(nickname);
                if (stats) {
                    this.monitorStats.set(nickname, {
                        totalTweets: stats.total_tweets || 0,
                        successCount: stats.success_count || 0,
                        errorCount: stats.error_count || 0,
                        rateLimitHits: stats.rate_limit_hits || 0,
                        lastMonitorTime: stats.updated_at,
                        lastSuccessTime: stats.last_success_time
                    });
                }
            }

            console.log('✅ 数据库历史数据加载完成');
        } catch (error) {
            console.error('❌ 从数据库加载数据失败:', error.message);
        }
    }



    /**
     * 保存数据到文件
     */
    saveDataToFile() {
        try {
            // 数据现在保存在数据库中，不需要保存到文件
            console.log('数据已保存到数据库');
        } catch (error) {
            console.error('保存数据失败:', error);
        }
    }



    /**
     * 清理旧数据文件
     * @param {number} daysToKeep - 保留天数，默认30天
     */
    cleanupOldData(daysToKeep = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

            // 清理旧推文文件
            const tweetsDir = path.join(this.dataDir, 'tweets');
            if (fs.existsSync(tweetsDir)) {
                const files = fs.readdirSync(tweetsDir);
                let cleanedCount = 0;

                files.forEach(file => {
                    if (file.startsWith('tweets_') && file.endsWith('.json')) {
                        const dateMatch = file.match(/tweets_(\d{4}-\d{2}-\d{2})\.json/);
                        if (dateMatch && dateMatch[1] < cutoffDateStr) {
                            fs.unlinkSync(path.join(tweetsDir, file));
                            cleanedCount++;
                        }
                    }
                });

                if (cleanedCount > 0) {
                    this.logMonitorEvent('info', `清理了 ${cleanedCount} 个旧推文文件`);
                }
            }

            // 清理旧日志文件
            const logsDir = path.join(this.dataDir, 'logs');
            if (fs.existsSync(logsDir)) {
                const files = fs.readdirSync(logsDir);
                let cleanedCount = 0;

                files.forEach(file => {
                    if (file.includes('_') && file.endsWith('.log')) {
                        const dateMatch = file.match(/_(\d{4}-\d{2}-\d{2})\.log/);
                        if (dateMatch && dateMatch[1] < cutoffDateStr) {
                            fs.unlinkSync(path.join(logsDir, file));
                            cleanedCount++;
                        }
                    }
                });

                if (cleanedCount > 0) {
                    this.logMonitorEvent('info', `清理了 ${cleanedCount} 个旧日志文件`);
                }
            }

        } catch (error) {
            this.logMonitorEvent('error', '清理旧数据时出错', { error: error.message });
        }
    }

    /**
     * 获取数据存储统计
     * @returns {Object} 存储统计信息
     */
    getStorageStats() {
        try {
            const stats = {
                dataDir: this.dataDir,
                directories: {},
                totalFiles: 0,
                totalSize: 0
            };

            const calculateDirStats = (dirPath, dirName) => {
                if (!fs.existsSync(dirPath)) {
                    return { files: 0, size: 0 };
                }

                const files = fs.readdirSync(dirPath);
                let fileCount = 0;
                let totalSize = 0;

                files.forEach(file => {
                    const filePath = path.join(dirPath, file);
                    const fileStat = fs.statSync(filePath);

                    if (fileStat.isFile()) {
                        fileCount++;
                        totalSize += fileStat.size;
                    }
                });

                return { files: fileCount, size: totalSize };
            };

            // 统计各个子目录
            const subDirs = ['tweets', 'logs'];
            subDirs.forEach(subDir => {
                const dirPath = path.join(this.dataDir, subDir);
                const dirStats = calculateDirStats(dirPath, subDir);
                stats.directories[subDir] = dirStats;
                stats.totalFiles += dirStats.files;
                stats.totalSize += dirStats.size;
            });

            // 格式化大小
            stats.totalSizeFormatted = this.formatBytes(stats.totalSize);
            Object.keys(stats.directories).forEach(dir => {
                stats.directories[dir].sizeFormatted = this.formatBytes(stats.directories[dir].size);
            });

            return stats;

        } catch (error) {
            this.logMonitorEvent('error', '获取存储统计时出错', { error: error.message });
            return null;
        }
    }

    /**
     * 格式化字节大小
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的大小
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 更新用户监控统计
     * @param {string} nickname - 用户昵称
     * @param {number} tweetCount - 新推文数量
     * @param {boolean} success - 是否成功
     */
    async updateMonitorStats(nickname, tweetCount = 0, success = true) {
        if (!this.monitorStats.has(nickname)) {
            this.monitorStats.set(nickname, {
                totalTweets: 0,
                successCount: 0,
                errorCount: 0,
                lastMonitorTime: null,
                lastSuccessTime: null,
                rateLimitHits: 0
            });
        }

        const stats = this.monitorStats.get(nickname);
        stats.totalTweets += tweetCount;
        stats.lastMonitorTime = new Date().toISOString();

        if (success) {
            stats.successCount++;
            stats.lastSuccessTime = new Date().toISOString();
        } else {
            stats.errorCount++;
        }

        this.monitorStats.set(nickname, stats);

        // 同时更新数据库
        try {
            if (databaseManager.isHealthy()) {
                await databaseManager.updateMonitorStats(nickname, {
                    totalTweets: tweetCount,
                    successCount: success ? 1 : 0,
                    errorCount: success ? 0 : 1,
                    rateLimitHits: 0,
                    lastSuccessTime: success ? new Date().toISOString() : null
                });
            }
        } catch (error) {
            this.logMonitorEvent('warn', '更新数据库统计失败', {
                nickname,
                error: error.message
            });
        }
    }

    /**
     * 记录API限流
     * @param {string} nickname - 用户昵称
     */
    recordRateLimit(nickname) {
        if (this.monitorStats.has(nickname)) {
            const stats = this.monitorStats.get(nickname);
            stats.rateLimitHits++;
            this.monitorStats.set(nickname, stats);
        }
    }

    /**
     * 获取最后检查时间
     * @param {string} nickname - 用户昵称
     * @returns {Promise<string|null>} 最后检查时间
     */
    async getLastCheckTime(nickname) {
        try {
            if (databaseManager.isHealthy()) {
                const monitorState = await databaseManager.getMonitorState(nickname);
                return monitorState ? monitorState.last_check_time : null;
            }
        } catch (error) {
            this.logMonitorEvent('warn', '获取最后检查时间失败', {
                nickname,
                error: error.message
            });
        }
        return null;
    }

    /**
     * 更新最后检查时间
     * @param {string} nickname - 用户昵称
     * @param {string} checkTime - 检查时间（UTC时间）
     */
    async updateLastCheckTime(nickname, checkTime) {
        try {
            if (databaseManager.isHealthy()) {
                // 如果没有提供时间，使用当前ISO时间
                if (!checkTime) {
                    this.logMonitorEvent('info', '首次监控，使用当前UTC时间', { nickname });
                    checkTime = new Date().toISOString();
                }

                // 直接使用ISO格式字符串，不做任何转换
                this.logMonitorEvent('info', '准备更新最后检查时间', {
                    nickname,
                    checkTime: checkTime
                });

                const result = await databaseManager.updateMonitorState(nickname, null, checkTime);

                if (result) {
                    this.logMonitorEvent('info', '更新最后检查时间成功', {
                        nickname,
                        checkTime: checkTime
                    });
                } else {
                    this.logMonitorEvent('warn', '数据库更新返回false', {
                        nickname,
                        checkTime: checkTime
                    });
                }
            } else {
                this.logMonitorEvent('warn', '数据库不健康，跳过更新最后检查时间', {
                    nickname,
                    checkTime
                });
            }
        } catch (error) {
            this.logMonitorEvent('warn', '更新最后检查时间失败', {
                nickname,
                checkTime,
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * 更新最后推文ID（同时更新内存和数据库）
     * @param {string} nickname - 用户昵称
     * @param {string} lastTweetId - 最后推文ID
     */
    async updateLastTweetId(nickname, lastTweetId) {
        // 更新内存
        this.lastTweetIds.set(nickname, lastTweetId);

        // 更新数据库
        try {
            if (databaseManager.isHealthy()) {
                await databaseManager.saveMonitorState(nickname, lastTweetId);
            }
        } catch (error) {
            this.logMonitorEvent('warn', '保存推文ID到数据库失败', {
                nickname,
                lastTweetId,
                error: error.message
            });
        }
    }

    /**
     * 保存推文到文件
     * @param {Array} tweets - 推文列表
     */
    saveTweetsToFile(tweets) {
        if (tweets.length === 0) return [];

        try {
            const today = new Date().toISOString().split('T')[0];
            const filename = `tweets_${today}.json`;
            const filepath = path.join(this.dataDir, 'tweets', filename);

            let existingTweets = [];
            if (fs.existsSync(filepath)) {
                existingTweets = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            }

            // API已经基于时间过滤，返回的推文都是新的，直接保存
            existingTweets.push(...tweets);
            fs.writeFileSync(filepath, JSON.stringify(existingTweets, null, 2));
            console.log(`保存 ${tweets.length} 条新推文到 ${filename}`);

            // 返回所有推文，供后续处理使用
            return tweets;
        } catch (error) {
            console.error('保存推文失败:', error);
            return [];
        }
    }

    /**
     * 记录监控日志
     * @param {string} level - 日志级别 (info, warn, error)
     * @param {string} message - 日志消息
     * @param {Object} data - 额外数据
     */
    logMonitorEvent(level, message, data = {}) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                level,
                message,
                data
            };

            const today = new Date().toISOString().split('T')[0];
            const logFile = path.join(this.dataDir, 'logs', `monitor_${today}.log`);

            fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

            // 同时输出到控制台
            console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
        } catch (error) {
            console.error('记录日志失败:', error);
        }
    }

    /**
     * 为指定用户创建Twitter客户端
     * @param {string} nickname - 用户昵称
     * @param {string} credentialId - 指定使用的凭证ID（可选）
     * @returns {Promise<XClient|null>} Twitter客户端实例
     */
    async createClientForUser(nickname, credentialId = null) {
        try {
            // 获取用户配置
            const userConfig = configManager.getUserByNickname(nickname);
            if (!userConfig) {
                console.error(`未找到用户配置: ${nickname}`);
                return null;
            }

            // 获取API凭证
            let credential;
            if (credentialId) {
                credential = userConfig.apiCredentials.find(cred => cred.id === credentialId);
            } else {
                credential = configManager.getAvailableApiCredential(nickname);
            }

            if (!credential) {
                console.error(`未找到可用的API凭证: ${nickname}`);
                return null;
            }

            // 从数据库获取refreshToken
            let refreshToken = null;
            if (databaseManager.isHealthy()) {
                refreshToken = await databaseManager.getRefreshToken(credential.xUserName);
            }

            // 如果没有refreshToken，提示用户运行认证工具
            if (!refreshToken) {
                console.error(`❌ 用户 ${credential.xUserName} 缺少refreshToken`);
                console.error(`💡 请运行以下命令完成认证:`);
                console.error(`   - 认证所有凭证: npm run auth`);
                console.error(`   - 检查认证状态: npm run auth:check`);
                console.error(`   - 认证特定用户: npm run auth:user ${nickname}`);
                return null;
            }

            // 使用XClient创建客户端实例
            const xClient = await XClient.create({
                xClientId: credential.xClientId,
                xClientSecret: credential.xClientSecret,
                refreshToken: refreshToken,
                socksProxyUrl: credential.socksProxyUrl,
                xUserName: credential.xUserName
            });

            if (xClient) {
                // 添加额外的标识信息
                xClient.credentialId = credential.id;
                xClient.nickname = nickname;
            }

            return xClient;

        } catch (error) {
            console.error(`创建客户端失败 [用户 ${nickname}]:`, error);

            // 如果是API限流错误，尝试轮换到下一个凭证
            if (error.code === 429 && credentialId) {
                const nextCredential = configManager.getNextApiCredential(nickname, credentialId);
                if (nextCredential && nextCredential.id !== credentialId) {
                    console.log(`尝试轮换到下一个API凭证: ${nextCredential.id}`);
                    return await this.createClientForUser(nickname, nextCredential.id);
                }
            }

            return null;
        }
    }

    /**
     * 获取用户的最新推文（带重试机制）
     * @param {string} nickname - 用户昵称
     * @param {number} retryCount - 重试次数
     * @returns {Promise<Array>} 推文列表
     */
    async getUserTweets(nickname, retryCount = 0) {
        const maxRetries = 3;

        try {
            this.logMonitorEvent('info', `开始获取推文`, { nickname, retryCount });

            // 获取或创建客户端
            let client = this.activeClients.get(nickname);
            if (!client) {
                client = await this.createClientForUser(nickname);
                if (!client) {
                    this.updateMonitorStats(nickname, 0, false);
                    this.logMonitorEvent('error', `无法创建客户端`, { nickname });
                    return [];
                }
                this.activeClients.set(nickname, client);
            }

            // 获取上次检查时间 - 使用基于时间的监控
            const lastCheckTime = await this.getLastCheckTime(nickname);

            // 获取推文
            const tweets = await client.getUserTweets(nickname, lastCheckTime, 20);

            // 更新最后检查时间
            if (tweets.length > 0) {
                const latestTweet = tweets[0]; // 最新推文（倒序排序后的第一个）
                await this.updateLastCheckTime(nickname, latestTweet.createdAt);

                this.logMonitorEvent('info', `成功获取推文`, {
                    nickname,
                    count: tweets.length,
                    latestTweetId: latestTweet.id
                });
            }

            this.updateMonitorStats(nickname, tweets.length, true);
            return tweets;

        } catch (error) {
            this.logMonitorEvent('error', `获取推文失败`, {
                nickname,
                error: error.message,
                code: error.code,
                retryCount
            });

            // 处理API限流
            if (error.code === 429) {
                this.recordRateLimit(nickname);

                const client = this.activeClients.get(nickname);
                if (client && client.credentialId) {
                    const nextCredential = configManager.getNextApiCredential(nickname, client.credentialId);
                    if (nextCredential && nextCredential.id !== client.credentialId) {
                        this.logMonitorEvent('info', `API限流，轮换凭证`, {
                            nickname,
                            from: client.credentialId,
                            to: nextCredential.id
                        });

                        // 移除当前客户端
                        this.activeClients.delete(nickname);

                        // 等待后重试
                        const waitTime = Math.min(5000 * (retryCount + 1), 30000);
                        await new Promise(resolve => setTimeout(resolve, waitTime));

                        if (retryCount < maxRetries) {
                            return await this.getUserTweets(nickname, retryCount + 1);
                        }
                    }
                }
            }

            // 其他错误的重试逻辑
            if (retryCount < maxRetries && error.code !== 401) {
                const waitTime = Math.min(2000 * (retryCount + 1), 10000);
                this.logMonitorEvent('warn', `等待重试`, { nickname, waitTime, retryCount });

                await new Promise(resolve => setTimeout(resolve, waitTime));
                return await this.getUserTweets(nickname, retryCount + 1);
            }

            this.updateMonitorStats(nickname, 0, false);
            return [];
        }
    }

    /**
     * 监控所有配置的用户
     * @returns {Promise<Array>} 所有新推文
     */
    async monitorAllUsers() {
        const allTweets = [];
        const userNicknames = configManager.getMonitoredUserNicknames();

        this.logMonitorEvent('info', `开始监控所有用户`, {
            totalUsers: userNicknames.length,
            users: userNicknames
        });

        for (const nickname of userNicknames) {
            if (!configManager.isUserMonitorEnabled(nickname)) {
                this.logMonitorEvent('info', `跳过已禁用的用户`, { nickname });
                continue;
            }

            try {
                const tweets = await this.getUserTweets(nickname);
                if (tweets.length > 0) {
                    this.logMonitorEvent('info', `发现新推文`, {
                        nickname,
                        count: tweets.length
                    });
                    allTweets.push(...tweets);
                }
            } catch (error) {
                this.logMonitorEvent('error', `监控用户失败`, {
                    nickname,
                    error: error.message
                });
            }

            // 添加延迟避免过快请求
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // 保存推文和数据
        if (allTweets.length > 0) {
            const newTweets = this.saveTweetsToFile(allTweets);
            if (newTweets.length > 0) {
                this.handleNewTweets(newTweets);
            }
        }
        this.saveDataToFile();

        this.logMonitorEvent('info', `监控轮次完成`, {
            totalTweets: allTweets.length,
            users: userNicknames.length
        });

        return allTweets;
    }

    /**
     * 启动定时监控
     * @param {number} interval - 监控间隔（毫秒）
     * @returns {boolean} 是否启动成功
     */
    startMonitoring(interval = 60000) {
        if (this.isMonitoring) {
            this.logMonitorEvent('warn', '监控已在运行中');
            return false;
        }

        this.logMonitorEvent('info', '开始Twitter监控', { interval });
        this.isMonitoring = true;

        const monitor = async () => {
            if (!this.isMonitoring) {
                return;
            }

            try {
                const startTime = Date.now();
                const newTweets = await this.monitorAllUsers();
                const duration = Date.now() - startTime;

                if (newTweets.length > 0) {
                    this.logMonitorEvent('info', `监控发现新推文`, {
                        count: newTweets.length,
                        duration: `${duration}ms`
                    });
                    this.handleNewTweets(newTweets);
                } else {
                    this.logMonitorEvent('info', `监控完成，无新推文`, {
                        duration: `${duration}ms`
                    });
                }
            } catch (error) {
                this.logMonitorEvent('error', '监控过程中出错', {
                    error: error.message,
                    stack: error.stack
                });
            }
        };

        // 立即执行一次
        monitor();

        // 设置定时器
        this.monitorInterval = setInterval(monitor, interval);
        return true;
    }

    /**
     * 处理新推文
     * @param {Array} tweets - 新推文列表
     */
    handleNewTweets(tweets) {
        tweets.forEach(tweet => {
            this.logMonitorEvent('info', `新推文发现`, {
                nickname: tweet.nickname,
                text: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
                url: tweet.url,
                createdAt: tweet.createdAt,
                metrics: tweet.metrics
            });
        });

        // 发送钉钉通知
        this.sendTweetNotification(tweets);
    }

    /**
     * 发送推文钉钉通知
     * @param {Array} tweets - 推文列表
     */
    async sendTweetNotification(tweets) {
        if (tweets.length === 0) return;

        try {
            // 获取钉钉访问令牌
            const dingtalkAccessToken = configManager.getDingtalkAccessToken();

            if (!dingtalkAccessToken) {
                this.logMonitorEvent('warn', '未配置钉钉访问令牌，跳过通知发送');
                return;
            }

            // 创建钉钉通知器实例
            const { DingTalkNotifier } = await import('./notifier.js');
            const notifier = new DingTalkNotifier(dingtalkAccessToken);

            // 发送推文通知
            const result = await notifier.sendTweetNotification(tweets);

            if (result.success) {
                this.logMonitorEvent('info', '钉钉通知发送成功', {
                    tweetCount: tweets.length,
                    attempt: result.attempt
                });
            } else {
                this.logMonitorEvent('error', '钉钉通知发送失败', {
                    tweetCount: tweets.length,
                    error: result.error
                });
            }

        } catch (error) {
            this.logMonitorEvent('error', '处理钉钉通知时出错', {
                error: error.message,
                tweetCount: tweets.length
            });
        }
    }

    /**
     * 发送系统状态通知
     * @param {string} status - 状态类型 (success, warning, error, info)
     * @param {string} message - 状态消息
     * @param {Object} details - 详细信息
     */
    async sendSystemNotification(status, message, details = {}) {
        try {
            const dingtalkAccessToken = configManager.getDingtalkAccessToken();

            if (!dingtalkAccessToken) {
                this.logMonitorEvent('warn', '未配置钉钉访问令牌，跳过系统通知发送');
                return;
            }

            const { DingTalkNotifier } = await import('./notifier.js');
            const notifier = new DingTalkNotifier(dingtalkAccessToken);

            const result = await notifier.sendSystemNotification(status, message, details);

            if (result.success) {
                this.logMonitorEvent('info', '系统通知发送成功', { status, message });
            } else {
                this.logMonitorEvent('error', '系统通知发送失败', { status, message, error: result.error });
            }

        } catch (error) {
            this.logMonitorEvent('error', '发送系统通知时出错', {
                error: error.message,
                status,
                message
            });
        }
    }

    /**
     * 发送监控统计报告
     * @param {Object} stats - 统计数据
     */
    async sendMonitorReport(stats) {
        try {
            const dingtalkAccessToken = configManager.getDingtalkAccessToken();

            if (!dingtalkAccessToken) {
                this.logMonitorEvent('warn', '未配置钉钉访问令牌，跳过统计报告发送');
                return;
            }

            const { DingTalkNotifier } = await import('./notifier.js');
            const notifier = new DingTalkNotifier(dingtalkAccessToken);

            const result = await notifier.sendMonitorReport(stats);

            if (result.success) {
                this.logMonitorEvent('info', '监控统计报告发送成功');
            } else {
                this.logMonitorEvent('error', '监控统计报告发送失败', { error: result.error });
            }

        } catch (error) {
            this.logMonitorEvent('error', '发送监控统计报告时出错', {
                error: error.message
            });
        }
    }

    /**
     * 测试钉钉通知连接
     * @returns {Promise<boolean>} 是否连接成功
     */
    async testDingTalkConnection() {
        try {
            const dingtalkAccessToken = configManager.getDingtalkAccessToken();

            if (!dingtalkAccessToken) {
                this.logMonitorEvent('warn', '未配置钉钉访问令牌，无法测试连接');
                return false;
            }

            const { DingTalkNotifier } = await import('./notifier.js');
            const notifier = new DingTalkNotifier(dingtalkAccessToken);

            const isConnected = await notifier.testConnection();

            this.logMonitorEvent('info', `钉钉连接测试: ${isConnected ? '成功' : '失败'}`);
            return isConnected;

        } catch (error) {
            this.logMonitorEvent('error', '钉钉连接测试失败', { error: error.message });
            return false;
        }
    }

    /**
     * 初始化调度监控系统
     * @returns {boolean} 是否初始化成功
     */
    initializeScheduledMonitoring() {
        try {
            this.logMonitorEvent('info', '初始化调度监控系统');

            // 创建监控回调函数
            const monitorCallback = async (nickname, credentialIndex) => {
                await this.scheduledMonitorUser(nickname, credentialIndex);
            };

            // 初始化调度任务
            const success = scheduleManager.initializeAllSchedules(monitorCallback);

            if (success) {
                this.logMonitorEvent('info', '调度监控系统初始化成功');
                return true;
            } else {
                this.logMonitorEvent('error', '调度监控系统初始化失败');
                return false;
            }

        } catch (error) {
            this.logMonitorEvent('error', '初始化调度监控系统时出错', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * 启动调度监控
     * @returns {boolean} 是否启动成功
     */
    startScheduledMonitoring() {
        try {
            if (this.isMonitoring) {
                this.logMonitorEvent('warn', '调度监控已在运行中');
                return false;
            }

            // 启动调度任务
            const success = scheduleManager.startAllSchedules();

            if (success) {
                this.isMonitoring = true;
                this.logMonitorEvent('info', '调度监控已启动');
                return true;
            } else {
                this.logMonitorEvent('error', '启动调度监控失败');
                return false;
            }

        } catch (error) {
            this.logMonitorEvent('error', '启动调度监控时出错', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * 停止调度监控
     * @returns {boolean} 是否停止成功
     */
    stopScheduledMonitoring() {
        try {
            if (!this.isMonitoring) {
                this.logMonitorEvent('warn', '调度监控未在运行');
                return false;
            }

            // 停止调度任务
            const success = scheduleManager.stopAllSchedules();

            if (success) {
                this.isMonitoring = false;
                // 保存最终数据
                this.saveDataToFile();
                this.logMonitorEvent('info', '调度监控已停止');
                return true;
            } else {
                this.logMonitorEvent('error', '停止调度监控失败');
                return false;
            }

        } catch (error) {
            this.logMonitorEvent('error', '停止调度监控时出错', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * 调度触发的用户监控（带凭证索引）
     * @param {string} nickname - 用户昵称
     * @param {number} credentialIndex - 凭证索引
     * @returns {Promise<Array>} 推文列表
     */
    async scheduledMonitorUser(nickname, credentialIndex) {
        if (!configManager.isUserMonitorEnabled(nickname)) {
            this.logMonitorEvent('warn', `用户监控已禁用`, { nickname });
            return [];
        }

        this.logMonitorEvent('info', `调度监控触发`, {
            nickname,
            credentialIndex,
            time: new Date().toISOString()
        });

        // 首先确保数据库连接可用
        if (!await databaseManager.ensureConnection()) {
            this.logMonitorEvent('error', `数据库连接不可用，跳过本次监控`, { nickname });
            return [];
        }

        try {
            // 获取用户配置
            const userConfig = configManager.getUserByNickname(nickname);
            if (!userConfig || !userConfig.apiCredentials) {
                this.logMonitorEvent('error', `用户配置不存在`, { nickname });
                return [];
            }

            // 获取指定索引的凭证
            const credential = userConfig.apiCredentials[credentialIndex];
            if (!credential) {
                this.logMonitorEvent('error', `凭证索引不存在`, {
                    nickname,
                    credentialIndex,
                    totalCredentials: userConfig.apiCredentials.length
                });
                return [];
            }

            // 使用指定凭证创建客户端
            const client = await this.createClientForUser(nickname, credential.id);
            if (!client) {
                this.logMonitorEvent('error', `无法创建客户端`, {
                    nickname,
                    credentialId: credential.id
                });
                return [];
            }

            // 获取推文 - 使用基于时间的监控
            const lastCheckTime = await this.getLastCheckTime(nickname);
            const tweets = await client.getUserTweets(nickname, lastCheckTime, 20);

            // 更新最后检查时间
            if (tweets.length > 0) {
                // 使用最新推文的时间作为下次检查的起始时间
                const latestTweet = tweets[0]; // 因为已按时间倒序排序，第一个是最新的
                // 确保时间格式正确
                const checkTime = latestTweet.createdAt instanceof Date ?
                    latestTweet.createdAt.toISOString() :
                    latestTweet.createdAt;
                await this.updateLastCheckTime(nickname, checkTime);

                this.logMonitorEvent('info', `调度监控成功获取推文`, {
                    nickname,
                    credentialIndex,
                    count: tweets.length,
                    latestTweet: latestTweet.createdAt
                });

                // 保存推文和发送通知
                console.log(`准备保存推文到文件，推文数量: ${tweets.length}`);
                const newTweets = this.saveTweetsToFile(tweets);
                console.log(`saveTweetsToFile返回的新推文数量: ${newTweets.length}`);

                if (newTweets.length > 0) {
                    console.log(`准备处理新推文并发送通知`);
                    this.handleNewTweets(newTweets);
                } else {
                    console.log(`没有新推文需要处理，可能是重复推文`);
                }
            } else {
                // 没有新推文时不更新检查时间，保持原有时间点继续查询
                this.logMonitorEvent('info', `调度监控无新推文`, {
                    nickname,
                    credentialIndex,
                    message: '保持原有检查时间点，下次继续从该时间查询'
                });
            }

            this.updateMonitorStats(nickname, tweets.length, true);
            this.saveDataToFile();

            return tweets;

        } catch (error) {
            this.logMonitorEvent('error', `调度监控失败`, {
                nickname,
                credentialIndex,
                error: error.message
            });

            // 处理API限流，尝试轮换凭证
            if (error.code === 429) {
                this.recordRateLimit(nickname);
                this.logMonitorEvent('warn', `API限流，将在下次调度时轮换凭证`, {
                    nickname,
                    credentialIndex
                });
            }

            this.updateMonitorStats(nickname, 0, false);
            return [];
        }
    }

    /**
     * 停止监控
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            this.logMonitorEvent('warn', '监控未在运行');
            return false;
        }

        this.isMonitoring = false;

        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        // 保存最终数据
        this.saveDataToFile();

        this.logMonitorEvent('info', 'Twitter监控已停止');
        return true;
    }

    /**
     * 获取监控状态
     * @returns {Object} 监控状态信息
     */
    getMonitorStatus() {
        const userNicknames = configManager.getMonitoredUserNicknames();
        const activeUsers = Array.from(this.activeClients.keys());

        return {
            isMonitoring: this.isMonitoring,
            totalUsers: userNicknames.length,
            activeClients: activeUsers.length,
            monitoredUsers: userNicknames,
            activeUsers: activeUsers,
            stats: Object.fromEntries(this.monitorStats),
            lastTweetIds: Object.fromEntries(this.lastTweetIds)
        };
    }

    /**
     * 获取用户监控统计
     * @param {string} nickname - 用户昵称（可选，不提供则返回所有用户）
     * @returns {Object} 统计信息
     */
    getUserStats(nickname = null) {
        if (nickname) {
            return this.monitorStats.get(nickname) || null;
        }
        return Object.fromEntries(this.monitorStats);
    }

    /**
     * 重置用户统计
     * @param {string} nickname - 用户昵称
     * @returns {boolean} 是否重置成功
     */
    resetUserStats(nickname) {
        if (this.monitorStats.has(nickname)) {
            this.monitorStats.set(nickname, {
                totalTweets: 0,
                successCount: 0,
                errorCount: 0,
                lastMonitorTime: null,
                lastSuccessTime: null,
                rateLimitHits: 0
            });
            this.saveDataToFile();
            this.logMonitorEvent('info', `重置用户统计`, { nickname });
            return true;
        }
        return false;
    }

    /**
     * 清理过期的客户端连接
     */
    cleanupExpiredClients() {
        const now = Date.now();
        const maxIdleTime = 30 * 60 * 1000; // 30分钟

        for (const [nickname, client] of this.activeClients.entries()) {
            if (client.lastUsed && (now - client.lastUsed) > maxIdleTime) {
                this.activeClients.delete(nickname);
                this.logMonitorEvent('info', `清理过期客户端`, { nickname });
            }
        }
    }

    /**
     * 手动触发单个用户监控
     * @param {string} nickname - 用户昵称
     * @returns {Promise<Array>} 推文列表
     */
    async manualMonitorUser(nickname) {
        if (!configManager.isUserMonitorEnabled(nickname)) {
            this.logMonitorEvent('warn', `用户监控已禁用`, { nickname });
            return [];
        }

        this.logMonitorEvent('info', `手动触发用户监控`, { nickname });

        try {
            const tweets = await this.getUserTweets(nickname);

            if (tweets.length > 0) {
                const newTweets = this.saveTweetsToFile(tweets);
                if (newTweets.length > 0) {
                    this.handleNewTweets(newTweets);
                }
            }

            this.saveDataToFile();
            return tweets;
        } catch (error) {
            this.logMonitorEvent('error', `手动监控失败`, {
                nickname,
                error: error.message
            });
            return [];
        }
    }

    /**
     * 检查所有API凭证是否已认证
     * @returns {boolean} 是否所有凭证都已认证
     */
    checkAllCredentialsAuthenticated() {
        try {
            console.log('🔐 检查API凭证认证状态...');

            const users = configManager.getMonitoredUsers();
            const unauthenticatedCredentials = [];
            let totalCredentials = 0;
            let authenticatedCredentials = 0;

            for (const user of users) {
                if (!user.apiCredentials || user.apiCredentials.length === 0) {
                    console.warn(`⚠️  用户 ${user.xMonitorNickName} 无API凭证配置`);
                    continue;
                }

                for (const credential of user.apiCredentials) {
                    totalCredentials++;

                    if (!credential.xRefreshToken || credential.xRefreshToken.trim() === '') {
                        unauthenticatedCredentials.push({
                            nickname: user.xMonitorNickName,
                            credentialId: credential.id,
                            xUserName: credential.xUserName
                        });
                        console.error(`❌ 凭证未认证: ${user.xMonitorNickName} - ${credential.xUserName} (ID: ${credential.id})`);
                    } else {
                        authenticatedCredentials++;
                        console.log(`✅ 凭证已认证: ${user.xMonitorNickName} - ${credential.xUserName} (ID: ${credential.id})`);
                    }
                }
            }

            console.log(`📊 认证状态统计: ${authenticatedCredentials}/${totalCredentials} 个凭证已认证`);

            if (unauthenticatedCredentials.length > 0) {
                console.error('\n❌ 发现未认证的API凭证，系统无法启动！');
                console.error('请手动完成以下凭证的OAuth2认证：');
                console.error('=====================================');

                unauthenticatedCredentials.forEach((cred, index) => {
                    console.error(`${index + 1}. 用户: ${cred.nickname}`);
                    console.error(`   凭证ID: ${cred.credentialId}`);
                    console.error(`   X用户名: ${cred.xUserName}`);
                    console.error(`   状态: 缺少 xRefreshToken`);
                    console.error('   ---');
                });

                console.error('认证步骤：');
                console.error('1. 使用指纹浏览器打开对应的浏览器配置');
                console.error('2. 运行OAuth2认证流程获取refreshToken');
                console.error('3. 将获取的refreshToken填入config.json对应位置');
                console.error('4. 重新启动系统');
                console.error('=====================================\n');

                return false;
            }

            console.log('✅ 所有API凭证认证检查通过');
            return true;

        } catch (error) {
            console.error('❌ 检查API凭证认证时出错:', error.message);
            return false;
        }
    }

    /**
     * 获取认证状态报告
     * @returns {Object} 认证状态信息
     */
    async getAuthenticationStatus() {
        try {
            const users = configManager.getMonitoredUsers();
            const authStatus = {
                totalUsers: users.length,
                totalCredentials: 0,
                userStatus: {}
            };

            for (const user of users) {
                const userAuth = {
                    nickname: user.xMonitorNickName,
                    credentials: [],
                    validCredentials: 0,
                    totalCredentials: user.apiCredentials ? user.apiCredentials.length : 0
                };

                if (user.apiCredentials) {
                    for (const credential of user.apiCredentials) {
                        authStatus.totalCredentials++;

                        // 从数据库检查是否有有效的refreshToken
                        let hasRefreshToken = false;
                        if (databaseManager.isHealthy()) {
                            const refreshToken = await databaseManager.getRefreshToken(credential.xUserName);
                            hasRefreshToken = !!refreshToken;
                        }

                        userAuth.credentials.push({
                            id: credential.id,
                            xUserName: credential.xUserName,
                            hasRefreshToken: hasRefreshToken,
                        });

                        if (hasRefreshToken) {
                            userAuth.validCredentials++;
                        }
                    }
                }

                authStatus.userStatus[user.xMonitorNickName] = userAuth;
            }

            return authStatus;

        } catch (error) {
            this.logMonitorEvent('error', '获取认证状态时出错', {
                error: error.message
            });
            return null;
        }
    }

    /**
     * 获取今日推文统计
     * @returns {Object} 今日统计信息
     */
    getTodayStats() {
        const today = new Date().toISOString().split('T')[0];
        const todayTweetsFile = path.join(this.dataDir, 'tweets', `tweets_${today}.json`);

        let todayTweets = [];
        if (fs.existsSync(todayTweetsFile)) {
            try {
                todayTweets = JSON.parse(fs.readFileSync(todayTweetsFile, 'utf8'));
            } catch (error) {
                this.logMonitorEvent('error', '读取今日推文文件失败', { error: error.message });
            }
        }

        const userStats = {};
        todayTweets.forEach(tweet => {
            if (!userStats[tweet.nickname]) {
                userStats[tweet.nickname] = 0;
            }
            userStats[tweet.nickname]++;
        });

        return {
            date: today,
            totalTweets: todayTweets.length,
            userBreakdown: userStats,
            tweets: todayTweets
        };
    }
}

// 创建监控管理器实例
export const twitterMonitor = new xMonitorManager();