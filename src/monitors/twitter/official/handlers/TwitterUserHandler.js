/**
 * Twitter用户管理器
 * 处理用户相关的操作和管理
 */
export class TwitterUserHandler {
    constructor(twitterService, apiClients) {
        this.twitterService = twitterService;
        this.apiClients = apiClients;
        this.userInfoCache = new Map(); // 缓存用户信息
    }

    /**
     * 检查单个用户的推文
     * @param {Object} client - API客户端
     * @returns {Promise<Object>} 检查结果
     */
    async checkUserTweets(client) {
        try {
            const credential = client.credentials;
            const monitorUser = credential.monitorUser;

            console.log(`🔍 检查用户推文: @${monitorUser}`);

            // 检查API使用限制
            if (!client.canMakeRequest()) {
                const status = client.getUsageStatus();
                console.log(`⚠️  API限制达到: ${status.requestCount}/${status.dailyLimit}`);
                return {
                    success: false,
                    reason: 'api_limit_reached',
                    username: monitorUser,
                    requestCount: status.requestCount,
                    dailyLimit: status.dailyLimit
                };
            }

            // 获取用户信息
            const userInfo = await this.getUserInfo(client, monitorUser);
            if (!userInfo) {
                return {
                    success: false,
                    reason: 'user_info_failed',
                    username: monitorUser
                };
            }

            // 获取最后处理的推文ID
            const lastTweetId = await this.twitterService.recordsManager.getLastTweetId(monitorUser);
            console.log(`   📊 最后推文ID: ${lastTweetId || '无'}`);

            // 获取新推文
            const tweets = await this.getNewTweets(client, userInfo, lastTweetId);
            
            if (tweets.length === 0) {
                console.log(`   📭 @${monitorUser} 没有新推文`);
                return {
                    success: true,
                    username: monitorUser,
                    newTweets: 0,
                    processed: 0
                };
            }

            console.log(`   📊 @${monitorUser} 发现 ${tweets.length} 条新推文`);

            // 记录API请求
            client.recordRequest();

            return {
                success: true,
                username: monitorUser,
                userInfo: userInfo,
                tweets: tweets,
                newTweets: tweets.length,
                lastTweetId: lastTweetId
            };

        } catch (error) {
            console.error(`❌ 检查用户推文失败 (@${client.credentials.monitorUser}):`, error.message);
            return {
                success: false,
                reason: 'check_failed',
                username: client.credentials.monitorUser,
                error: error.message
            };
        }
    }

    /**
     * 获取用户信息（带缓存）
     * @private
     * @param {Object} client - API客户端
     * @param {string} username - 用户名
     * @returns {Promise<Object|null>} 用户信息
     */
    async getUserInfo(client, username) {
        // 检查缓存
        if (this.userInfoCache.has(username)) {
            const cached = this.userInfoCache.get(username);
            const cacheAge = Date.now() - cached.timestamp;
            const oneHour = 60 * 60 * 1000;
            
            if (cacheAge < oneHour) {
                console.log(`   💾 使用缓存的用户信息: @${username}`);
                return cached.userInfo;
            }
        }

        // 从API获取
        const userInfo = await client.getUserInfo(username);
        if (userInfo) {
            // 缓存用户信息
            this.userInfoCache.set(username, {
                userInfo: userInfo,
                timestamp: Date.now()
            });
        }

        return userInfo;
    }

    /**
     * 获取新推文
     * @private
     * @param {Object} client - API客户端
     * @param {Object} userInfo - 用户信息
     * @param {string|null} lastTweetId - 最后推文ID
     * @returns {Promise<Array>} 新推文列表
     */
    async getNewTweets(client, userInfo, lastTweetId) {
        const options = {
            max_results: 10
        };

        // 如果有最后推文ID，使用since_id参数
        if (lastTweetId) {
            options.since_id = lastTweetId;
        }

        const tweets = await client.getUserTweets(userInfo.id, options);
        
        // 过滤掉可能的重复推文
        if (lastTweetId) {
            return tweets.filter(tweet => {
                const tweetIdBigInt = BigInt(tweet.id);
                const lastIdBigInt = BigInt(lastTweetId);
                return tweetIdBigInt > lastIdBigInt;
            });
        }

        return tweets;
    }

    /**
     * 获取所有监控用户的状态
     * @returns {Array} 用户状态列表
     */
    getAllUserStatus() {
        const userStatus = [];

        for (const [clientId, client] of this.apiClients.entries()) {
            const status = client.getStatus();
            const credential = client.credentials;
            
            userStatus.push({
                clientId: clientId,
                twitterUser: credential.twitterUserName,
                monitorUser: credential.monitorUser,
                isInitialized: status.isInitialized,
                canMakeRequest: status.canMakeRequest,
                requestCount: status.requestCount,
                dailyLimit: status.dailyLimit,
                hasProxy: status.hasProxy,
                lastRequestTime: status.lastRequestTime
            });
        }

        return userStatus;
    }

    /**
     * 获取可用的API客户端
     * @returns {Array} 可用的客户端列表
     */
    getAvailableClients() {
        const availableClients = [];

        for (const [clientId, client] of this.apiClients.entries()) {
            if (client.isInitialized && client.canMakeRequest()) {
                availableClients.push({
                    clientId: clientId,
                    client: client,
                    username: client.credentials.twitterUserName,
                    monitorUser: client.credentials.monitorUser
                });
            }
        }

        return availableClients;
    }

    /**
     * 根据监控用户查找对应的API客户端
     * @param {string} monitorUser - 监控用户名
     * @returns {Object|null} API客户端
     */
    findClientForUser(monitorUser) {
        for (const [clientId, client] of this.apiClients.entries()) {
            if (client.credentials.monitorUser === monitorUser && 
                client.isInitialized && 
                client.canMakeRequest()) {
                return client;
            }
        }
        return null;
    }

    /**
     * 清理用户信息缓存
     * @param {string} username - 用户名（可选，不提供则清理所有）
     */
    clearUserInfoCache(username = null) {
        if (username) {
            this.userInfoCache.delete(username);
            console.log(`🗑️  已清理 @${username} 的用户信息缓存`);
        } else {
            this.userInfoCache.clear();
            console.log('🗑️  已清理所有用户信息缓存');
        }
    }

    /**
     * 获取缓存统计信息
     * @returns {Object} 缓存统计
     */
    getCacheStats() {
        return {
            userInfoCacheSize: this.userInfoCache.size,
            cachedUsers: Array.from(this.userInfoCache.keys())
        };
    }
}
