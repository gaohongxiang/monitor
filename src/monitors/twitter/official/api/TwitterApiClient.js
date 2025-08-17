/**
 * Twitter API客户端
 * 专门处理Twitter API的调用，不包含认证逻辑
 */
import { TwitterApi } from 'twitter-api-v2';
import { SocksProxyAgent } from 'socks-proxy-agent';

export class TwitterApiClient {
    constructor(credentials, database) {
        this.credentials = credentials;
        this.database = database;
        this.client = null;
        this.proxy = null;
        this.isInitialized = false;
        this.lastRequestTime = 0;
        this.requestCount = 0;
        this.dailyRequestLimit = credentials.dailyRequestsPerApi || 3;
        this.cachedUserInfo = null; // 缓存用户信息，避免重复API请求
    }

    /**
     * 初始化API客户端
     * @returns {Promise<boolean>} 是否初始化成功
     */
    async initialize() {
        try {
            console.log(`🔧 初始化Twitter API客户端: ${this.credentials.twitterUserName}`);

            // 设置代理
            if (this.credentials.socksProxyUrl) {
                this.proxy = new SocksProxyAgent(this.credentials.socksProxyUrl);
                console.log(`   🌐 使用代理: ${this.credentials.socksProxyUrl}`);
            }

            // 获取refresh token
            const refreshToken = await this.getRefreshToken();
            if (!refreshToken) {
                throw new Error(`未找到 ${this.credentials.twitterUserName} 的refresh token`);
            }

            // 初始化Twitter API客户端
            this.client = new TwitterApi({
                clientId: this.credentials.twitterClientId,
                clientSecret: this.credentials.twitterClientSecret,
                httpAgent: this.proxy
            });

            // 使用refresh token获取访问令牌
            const { client: authenticatedClient } = await this.client.refreshOAuth2Token(refreshToken);
            this.client = authenticatedClient;

            this.isInitialized = true;
            console.log(`   ✅ ${this.credentials.twitterUserName} API客户端初始化成功`);
            return true;

        } catch (error) {
            console.error(`❌ ${this.credentials.twitterUserName} API客户端初始化失败:`, error.message);
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * 获取用户信息
     * @param {string} username - 用户名
     * @returns {Promise<Object|null>} 用户信息
     */
    async getUserInfo(username) {
        if (!this.isInitialized) {
            throw new Error('API客户端未初始化');
        }

        // 使用缓存避免重复请求
        if (this.cachedUserInfo && this.cachedUserInfo.username === username) {
            return this.cachedUserInfo;
        }

        try {
            console.log(`   🔍 获取用户信息: @${username}`);
            
            const user = await this.client.v2.userByUsername(username, {
                'user.fields': ['id', 'name', 'username', 'public_metrics', 'verified']
            });

            if (!user.data) {
                throw new Error(`用户 @${username} 不存在`);
            }

            const userInfo = {
                id: user.data.id,
                username: user.data.username,
                name: user.data.name,
                verified: user.data.verified || false,
                followers_count: user.data.public_metrics?.followers_count || 0,
                following_count: user.data.public_metrics?.following_count || 0,
                tweet_count: user.data.public_metrics?.tweet_count || 0
            };

            // 缓存用户信息
            this.cachedUserInfo = userInfo;
            
            console.log(`   ✅ 用户信息获取成功: @${username} (${userInfo.name})`);
            return userInfo;

        } catch (error) {
            console.error(`❌ 获取用户信息失败 (@${username}):`, error.message);
            return null;
        }
    }

    /**
     * 获取用户推文
     * @param {string} userId - 用户ID
     * @param {Object} options - 查询选项
     * @param {string} options.since_id - 起始推文ID
     * @param {number} options.max_results - 最大结果数
     * @returns {Promise<Array>} 推文列表
     */
    async getUserTweets(userId, options = {}) {
        if (!this.isInitialized) {
            throw new Error('API客户端未初始化');
        }

        try {
            console.log(`   📝 获取用户推文: ${userId}`);
            
            const queryOptions = {
                max_results: Math.min(options.max_results || 10, 100),
                'tweet.fields': ['id', 'text', 'created_at', 'author_id', 'public_metrics'],
                'user.fields': ['id', 'name', 'username'],
                exclude: ['retweets', 'replies'] // 排除转推和回复
            };

            // 如果提供了since_id，添加到查询参数
            if (options.since_id) {
                queryOptions.since_id = options.since_id;
                console.log(`     📊 查询起始ID: ${options.since_id}`);
            }

            const tweets = await this.client.v2.userTimeline(userId, queryOptions);
            
            if (!tweets.data || tweets.data.length === 0) {
                console.log(`   📭 未找到新推文`);
                return [];
            }

            console.log(`   📊 获取到 ${tweets.data.length} 条推文`);
            
            // 转换为统一格式
            const formattedTweets = tweets.data.map(tweet => ({
                id: tweet.id,
                text: tweet.text,
                created_at: tweet.created_at,
                author_id: tweet.author_id,
                public_metrics: tweet.public_metrics || {}
            }));

            return formattedTweets;

        } catch (error) {
            console.error(`❌ 获取用户推文失败 (${userId}):`, error.message);
            
            // 检查是否是API限制错误
            if (error.code === 429) {
                console.warn(`⚠️  API限制达到，用户: ${this.credentials.twitterUserName}`);
            }
            
            return [];
        }
    }

    /**
     * 检查API使用限制
     * @returns {boolean} 是否可以继续使用API
     */
    canMakeRequest() {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        // 重置每日计数器
        if (now - this.lastRequestTime > oneDay) {
            this.requestCount = 0;
        }

        return this.requestCount < this.dailyRequestLimit;
    }

    /**
     * 记录API请求
     */
    recordRequest() {
        this.lastRequestTime = Date.now();
        this.requestCount++;
    }

    /**
     * 获取API使用状态
     * @returns {Object} API使用状态
     */
    getUsageStatus() {
        return {
            username: this.credentials.twitterUserName,
            requestCount: this.requestCount,
            dailyLimit: this.dailyRequestLimit,
            canMakeRequest: this.canMakeRequest(),
            lastRequestTime: this.lastRequestTime
        };
    }

    /**
     * 从数据库获取refresh token
     * @private
     * @returns {Promise<string|null>} refresh token
     */
    async getRefreshToken() {
        try {
            const result = await this.database.pool.query(
                'SELECT refresh_token FROM twitter_credentials WHERE twitter_user_name = $1',
                [this.credentials.twitterUserName]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0].refresh_token;
        } catch (error) {
            console.error(`❌ 获取refresh token失败 (${this.credentials.twitterUserName}):`, error.message);
            return null;
        }
    }

    /**
     * 清理资源
     */
    cleanup() {
        this.client = null;
        this.proxy = null;
        this.isInitialized = false;
        this.cachedUserInfo = null;
    }

    /**
     * 获取客户端状态
     * @returns {Object} 客户端状态
     */
    getStatus() {
        return {
            username: this.credentials.twitterUserName,
            monitorUser: this.credentials.monitorUser,
            isInitialized: this.isInitialized,
            requestCount: this.requestCount,
            dailyLimit: this.dailyRequestLimit,
            canMakeRequest: this.canMakeRequest(),
            hasProxy: !!this.proxy,
            lastRequestTime: this.lastRequestTime
        };
    }
}
