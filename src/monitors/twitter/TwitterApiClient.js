/**
 * Twitter API客户端
 * 处理Twitter API的认证和数据获取
 * 基于原有的x.js重构而来，整合了OAuth2认证和API调用功能
 */
import { TwitterApi } from 'twitter-api-v2';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { BitBrowser } from './BitBrowser.js';

/**
 * Twitter OAuth2认证工具类
 * 用于处理Twitter的OAuth2.0认证流程，获取和管理refresh token
 */
export class TwitterAuthenticator {
    /**
     * TwitterAuthenticator构造函数
     * @param {Object} browserUtil - 浏览器工具实例
     * @param {Object} proxy - 代理对象
     * @param {Object} client - Twitter API客户端
     */
    constructor(browserUtil, proxy, client) {
        this.browserUtil = browserUtil;
        this.page = browserUtil.page;
        this.context = browserUtil.context;
        this.proxy = proxy;
        this.client = client;
    }

    /**
     * 创建并初始化TwitterAuthenticator实例
     * @static
     * @param {Object} params - 初始化参数
     * @param {string} params.twitterClientId - 凭证Id
     * @param {string} params.twitterClientSecret - 凭证密钥
     * @param {string} params.browserId - 指纹浏览器Id
     * @param {string} params.socksProxyUrl - 代理
     * @returns {Promise<TwitterAuthenticator>} 初始化完成的实例
     * @throws {Error} 缺少必要的配置时抛出错误
     */
    static async create({ twitterClientId, twitterClientSecret, browserId, socksProxyUrl }) {
        // 使用共享的浏览器工具创建函数
        const browserUtil = await BitBrowser.create({ browserId });

        // 初始化API客户端
        const proxy = new SocksProxyAgent(socksProxyUrl);
        const client = new TwitterApi({
            clientId: twitterClientId,
            clientSecret: twitterClientSecret,
            httpAgent: proxy
        });

        // 创建TwitterAuthenticator实例
        const instance = new TwitterAuthenticator(browserUtil, proxy, client);

        return instance;
    }

    /**
     * 执行OAuth2授权流程并保存refresh token
     * @param {Object} params - 授权参数
     * @param {string} params.twitterUserName - Twitter用户名
     * @param {string} params.twitterRedirectUri - 重定向URI
     * @param {Object} database - 数据库管理器
     * @returns {Promise<boolean>} 是否授权成功
     */
    async authorizeAndSaveToken({ twitterUserName, twitterRedirectUri }, database) {
        try {
            // 获取授权URL
            const { url, codeVerifier } = this.client.generateOAuth2AuthLink(
                twitterRedirectUri,
                {
                    scope: [
                        'offline.access',
                        'tweet.read',
                        'tweet.write',
                        'users.read',
                        'follows.read',
                        'follows.write',
                        'like.read',
                        'like.write',
                        'list.read',
                        'list.write'
                    ]
                }
            );

            await this.page.goto(url, { timeout: 60000 });
            await this.page.waitForTimeout(2000);
            await this.page.getByTestId('OAuth_Consent_Button').click();
            await this.page.waitForURL((url) => {
                return url.toString().includes('code=');
            }, { timeout: 60000 });
            const code = await this.page.url().split('code=')[1];

            // 获取 token
            const { refreshToken } = await this.client.loginWithOAuth2({
                code,
                codeVerifier,
                redirectUri: twitterRedirectUri
            });

            // 保存 refresh token 到数据库
            await database.saveRefreshToken(twitterUserName, refreshToken);
            console.log(`✅ refreshToken已保存到数据库 [用户: ${twitterUserName}]`);

            return true;

        } catch (error) {
            console.error('X OAuth2授权失败:', error);
            return false;
        }
    }
}

/**
 * Twitter API客户端类
 * 用于调用 Twitter API执行各种操作，如获取推文、发推、关注等
 * 整合了原有x.js中的XClient功能
 */
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
     * 初始化Twitter API客户端
     */
    async initialize() {
        try {
            if (this.isInitialized) {
                return true;
            }

            console.log(`初始化Twitter API客户端: ${this.credentials.twitterUserName}`);

            // 初始化代理
            if (this.credentials.socksProxyUrl) {
                this.proxy = new SocksProxyAgent(this.credentials.socksProxyUrl);
            }

            // 获取并刷新访问令牌
            await this.ensureValidAccessToken();

            this.isInitialized = true;
            console.log(`✅ Twitter API客户端初始化成功: ${this.credentials.twitterUserName}`);
            return true;

        } catch (error) {
            console.error(`❌ Twitter API客户端初始化失败: ${this.credentials.twitterUserName}`, error);
            return false;
        }
    }

    /**
     * 确保访问令牌有效
     */
    async ensureValidAccessToken() {
        try {
            // 从数据库获取刷新令牌
            const refreshToken = await this.database.getRefreshToken(this.credentials.twitterUserName);

            if (!refreshToken) {
                throw new Error(`未找到用户 ${this.credentials.twitterUserName} 的刷新令牌`);
            }

            // 初始化 Twitter API 客户端
            const baseClient = new TwitterApi({
                clientId: this.credentials.twitterClientId,
                clientSecret: this.credentials.twitterClientSecret,
                httpAgent: this.proxy
            });

            // 刷新token
            const {
                client: refreshedClient,
                refreshToken: newRefreshToken
            } = await baseClient.refreshOAuth2Token(refreshToken);

            console.log(`✅ 刷新令牌成功 [用户: ${this.credentials.twitterUserName}]`);

            // 保存新的refreshToken到数据库
            await this.database.saveRefreshToken(this.credentials.twitterUserName, newRefreshToken);
            console.log(`✅ 新refreshToken已保存到数据库 [用户: ${this.credentials.twitterUserName}]`);

            // 设置客户端
            this.client = refreshedClient;

        } catch (error) {
            console.error(`❌ 刷新访问令牌失败: ${this.credentials.twitterUserName}`, error);
            throw error;
        }
    }

    /**
     * 获取当前用户信息
     * @returns {Promise<{userId: string, userName: string}>} 用户ID和用户名
     */
    async getCurrentUserProfile() {
        try {
            const user = await this.client.v2.me();
            const { id: userId, username: userName } = user.data;
            return { userId, userName };
        } catch (error) {
            console.error(`获取用户信息失败 [原因 ${error.message}]`);
            return false;
        }
    }

    /**
     * 通过用户名查找用户信息
     * @param {string} username - 目标用户名
     * @returns {Promise<{userId: string, nickname: string}>} 用户ID和昵称
     */
    async findUserByUsername(username) {
        try {
            const user = await this.client.v2.userByUsername(username);
            return { userId: user.data.id, nickname: user.data.name };
        } catch (error) {
            console.error(`获取用户信息失败 [原因 ${error.message}]`);
            return false;
        }
    }

    /**
     * 获取用户的最新推文（单次请求，节省API配额）
     * @param {string} username 用户名
     * @param {string} lastCheckTime 上次检查时间
     * @param {number} maxTweets 最大获取推文数量，默认20条
     * @returns {Promise<Array>} 推文列表
     */
    async getUserTweets(username, lastCheckTime = null, maxTweets = 20) {
        try {
            // 检查请求限制
            if (!this.canMakeRequest()) {
                throw new Error('已达到每日请求限制');
            }

            if (!this.client) {
                throw new Error('Twitter客户端未初始化');
            }

            // 缓存用户ID，避免重复API请求
            if (!this.cachedUserInfo || this.cachedUserInfo.username !== username) {
                const { userId, nickname } = await this.findUserByUsername(username);
                this.cachedUserInfo = { username, userId, nickname };
                console.log(`缓存用户信息 [用户: ${username}] [ID: ${userId}]`);
            }

            const { userId, nickname } = this.cachedUserInfo;

            // 构建查询参数 - 获取足够的推文来覆盖监控间隔
            const params = {
                max_results: Math.min(100, maxTweets), // Twitter API v2 单次最大100条
                'tweet.fields': 'created_at,author_id,public_metrics,context_annotations,text,note_tweet',
                'user.fields': 'username,name,verified',
                expansions: 'referenced_tweets.id,author_id'
            };

            // 如果有上次检查时间，计算时间范围
            if (lastCheckTime) {
                params.start_time = lastCheckTime;
                console.log(`获取推文 [用户: ${username}] [时间范围: ${lastCheckTime} 之后] [最大: ${params.max_results}条]`);
            } else {
                console.log(`获取推文 [用户: ${username}] [首次监控，最大: ${params.max_results}条]`)
            }

            // 单次API请求获取用户推文
            const tweets = await this.client.v2.userTimeline(userId, params);

            // 更新请求计数
            this.updateRequestCount();

            if (!tweets._realData || !tweets._realData.data || tweets._realData.data.length === 0) {
                console.log(`没有新推文 [用户: ${username}]`);
                return [];
            }

            // 格式化推文数据
            const formattedTweets = tweets._realData.data.map(tweet => {
                // 检查是否有完整的长推文文本
                let fullText = tweet.text;
                if (tweet.note_tweet && tweet.note_tweet.text) {
                    fullText = tweet.note_tweet.text;
                }

                return {
                    id: tweet.id,
                    nickname,
                    text: fullText,
                    createdAt: tweet.created_at, // Twitter API v2 使用 created_at 字段
                    url: `https://twitter.com/${username}/status/${tweet.id}`,
                    metrics: tweet.public_metrics,
                    author_id: tweet.author_id,
                    created_at: tweet.created_at,
                    public_metrics: tweet.public_metrics,
                    context_annotations: tweet.context_annotations || [],
                    raw_data: tweet
                };
            });

            // 按时间倒序排序（最新的在前面，符合用户期望）
            formattedTweets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // 额外的客户端时间过滤，确保不返回等于或早于lastCheckTime的推文
            let filteredTweets = formattedTweets;
            if (lastCheckTime) {
                const checkTimeMs = new Date(lastCheckTime).getTime();
                filteredTweets = formattedTweets.filter(tweet => {
                    const tweetTimeMs = new Date(tweet.createdAt).getTime();
                    return tweetTimeMs > checkTimeMs;
                });

                if (filteredTweets.length < formattedTweets.length) {
                    console.log(`客户端时间过滤: ${formattedTweets.length}条 -> ${filteredTweets.length}条 [过滤掉${formattedTweets.length - filteredTweets.length}条重复/旧推文]`);
                }
            }

            console.log(`获取完成 [用户: ${username}] [推文: ${filteredTweets.length}条] [API请求: 1次]`);
            return filteredTweets;

        } catch (error) {
            console.error(`获取用户推文失败 [用户 ${username}]`, error);

            // 处理API限流
            if (error.code === 429) {
                const resetSec = error.rateLimit?.reset || 0;
                const nowSec = Math.floor(Date.now() / 1000);
                const waitTimeSec = Math.max(resetSec - nowSec, 60); // 至少等待60秒
                const waitTimeMs = waitTimeSec * 1000;

                console.warn(`Twitter API达到速率限制，等待重试 ${waitTimeSec}秒 [用户: ${username}]`);
                await new Promise(resolve => setTimeout(resolve, waitTimeMs));

                // 递归重试
                return await this.getUserTweets(username, lastCheckTime, maxTweets);
            }

            throw error;
        }
    }

    /**
     * 关注指定用户
     * @param {string} username - 要关注的用户名
     * @returns {Promise<boolean>}
     */
    async follow(username) {
        try {
            const { userId } = await this.getCurrentUserProfile();
            const { userId: targetUserId } = await this.findUserByUsername(username);
            await this.client.v2.follow(userId, targetUserId);
            console.log(`关注成功 [用户 ${username}]`);
            return true;
        } catch (error) {
            console.error(`关注失败 [原因 ${error.message}]`);
            return false;
        }
    }

    /**
     * 发送推文
     * @param {string} text - 推文内容
     * @returns {Promise<string|boolean>} 推文ID或false
     */
    async tweet(text) {
        try {
            const { data: createdTweet } = await this.client.v2.tweet(text);
            const { id: tweetId } = createdTweet;
            console.log(`发送推文成功 [推文ID ${tweetId}]`);
            return tweetId;
        } catch (error) {
            console.error(`发送推文失败 [原因 ${error.message}]`);
            return false;
        }
    }

    /**
     * 检查是否可以发起请求
     * @returns {boolean} 是否可以请求
     */
    canMakeRequest() {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        // 如果是新的一天，重置请求计数
        if (now - this.lastRequestTime > oneDay) {
            this.requestCount = 0;
        }

        return this.requestCount < this.dailyRequestLimit;
    }

    /**
     * 更新请求计数
     */
    updateRequestCount() {
        this.requestCount++;
        this.lastRequestTime = Date.now();

        console.log(`API请求计数: ${this.requestCount}/${this.dailyRequestLimit} (${this.credentials.twitterUserName})`);
    }

    /**
     * 获取请求统计信息
     * @returns {Object} 统计信息
     */
    getRequestStats() {
        return {
            username: this.credentials.twitterUserName,
            requestCount: this.requestCount,
            dailyLimit: this.dailyRequestLimit,
            remainingRequests: Math.max(0, this.dailyRequestLimit - this.requestCount),
            lastRequestTime: this.lastRequestTime,
            canMakeRequest: this.canMakeRequest()
        };
    }

    /**
     * 重置请求计数
     */
    resetRequestCount() {
        this.requestCount = 0;
        this.lastRequestTime = 0;
        console.log(`重置请求计数: ${this.credentials.twitterUserName}`);
    }

    /**
     * 关闭客户端
     */
    async close() {
        try {
            this.isInitialized = false;
            this.client = null;
            this.cachedUserInfo = null;
            console.log(`Twitter API客户端已关闭: ${this.credentials.twitterUserName}`);

        } catch (error) {
            console.error(`关闭Twitter API客户端时出错: ${this.credentials.twitterUserName}`, error);
        }
    }

    /**
     * 测试连接
     * @returns {Promise<boolean>} 连接是否正常
     */
    async testConnection() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // 尝试获取自己的用户信息
            const result = await this.getCurrentUserProfile();
            return !!result;

        } catch (error) {
            console.error(`测试Twitter API连接失败: ${this.credentials.twitterUserName}`, error);
            return false;
        }
    }
}

// TwitterApiClient和TwitterAuthenticator类已经通过export class导出