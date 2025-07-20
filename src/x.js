import { TwitterApi } from 'twitter-api-v2';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { BitBrowserUtil } from './bitbrowser.js';
// import { notificationManager } from '../../notification-module/notification.js';
import { configManager } from './config.js';

/**
 *  X OAuth2认证工具类
 * 用于处理X的OAuth2.0认证流程，获取和管理refresh token
 */
export class XAuthenticator {
    /**
     * XAuthenticator构造函数
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
     * 创建并初始化XAuthenticator实例
     * @static
     * @param {Object} params - 初始化参数
     * @param {string} params.xClientId - 凭证Id
     * @param {string} params.xClientSecret - 凭证密钥
     * @param {string} params.browserId - 指纹浏览器Id
     * @param {string} params.socksProxyUrl - 代理
     * @returns {Promise<XAuthenticator>} 初始化完成的实例
     * @throws {Error} 缺少必要的配置时抛出错误
     */
    static async create({ xClientId, xClientSecret, browserId, socksProxyUrl }) {
        // 3. 使用共享的浏览器工具创建函数
        const browserUtil = await BitBrowserUtil.create({ browserId });

        // 4. 初始化API客户端
        const proxy = new SocksProxyAgent(socksProxyUrl);
        const client = new TwitterApi({
            clientId: xClientId,
            clientSecret: xClientSecret,
            httpAgent: proxy
        });

        // 5. 创建XAuthenticator实例
        const instance = new XAuthenticator(browserUtil, proxy, client);
        // 凭证信息将在后续通过外部设置

        return instance;
    }

    /**
     * 执行OAuth2授权流程并保存refresh token
     * @param {Object} params - 授权参数
     * @param {string} params.xUserName - X用户名
     * @returns {Promise<boolean>} 是否授权成功
     */
    async authorizeAndSaveToken({ xUserName }) {
        try {
            // 获取授权URL
            const { url, codeVerifier, state } = this.client.generateOAuth2AuthLink(
                this.credential.xRedirectUri,
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
                redirectUri: this.credential.xRedirectUri
            });

            // 直接保存 refresh token 到数据库
            const { databaseManager } = await import('./database.js');
            await databaseManager.saveRefreshToken(xUserName, refreshToken);
            console.log(`✅ refreshToken已保存到数据库 [用户: ${xUserName}]`);

        } catch (error) {
            console.error('X OAuth2授权失败:', error);
            return false;
        }
    }
}

/**
 * X API客户端类
 * 用于调用 X API执行各种操作，如发推、关注等
 */
export class XClient {
    /**
     * 创建并初始化XClient实例
     * @static
     * @param {Object} params - 初始化参数
     * @param {string} params.xClientId - 客户端ID
     * @param {string} params.xClientSecret - 客户端密钥
     * @param {string} params.refreshToken - 刷新令牌（可选，如果不提供则从数据库读取）
     * @param {string} params.socksProxyUrl - 代理服务器地址
     * @param {string} params.xUserName - X用户名（用于更新token）
     * @param {string} params.credentialId - 凭证ID（用于数据库操作）
     * @returns {Promise<XClient>} 初始化完成的实例
     * @throws {Error} 如果缺少必要的环境变量或初始化失败
     */
    static async create({
        xClientId,
        xClientSecret,
        refreshToken = null,
        socksProxyUrl,
        xUserName,
        credentialId
    }) {
        // 2. 创建实例
        const instance = new XClient();
        instance.credentialId = credentialId;
        instance.xUserName = xUserName;

        // 检查 proxy 是否已经是 SocksProxyAgent 实例
        instance.proxy = socksProxyUrl instanceof SocksProxyAgent ? socksProxyUrl : new SocksProxyAgent(socksProxyUrl);

        try {
            // 3. 如果没有提供refreshToken，从数据库读取
            let currentRefreshToken = refreshToken;
            if (!currentRefreshToken && xUserName) {
                const { databaseManager } = await import('./database.js');
                currentRefreshToken = await databaseManager.getRefreshToken(xUserName);
                console.log(`从数据库读取refreshToken [用户: ${xUserName}]`);
            }

            if (!currentRefreshToken) {
                console.log('未找到 refresh token, 请先完成授权');
                return false;
            }

            // 4. 初始化 X API 客户端
            const client = new TwitterApi({
                clientId: xClientId,
                clientSecret: xClientSecret,
                httpAgent: instance.proxy
            });

            // 5. 刷新token
            const {
                client: refreshedClient,
                refreshToken: newRefreshToken
            } = await client.refreshOAuth2Token(currentRefreshToken);

            console.log(`✅ 刷新令牌成功 [用户: ${xUserName}]`);

            // 6. 保存新的refreshToken到数据库
            const { databaseManager } = await import('./database.js');
            await databaseManager.saveRefreshToken(xUserName, newRefreshToken);
            console.log(`✅ 新refreshToken已保存到数据库 [用户: ${xUserName}]`);

            // 7. 设置客户端
            instance.client = refreshedClient;

            return instance;
        } catch (error) {
            console.error('初始化X客户端失败:', error);
            return false;
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
            // notificationManager.success(`获取用户信息成功 [用户 ${userName}]`);
            return { userId, userName };
        } catch (error) {
            console.error(`获取用户信息失败 [原因 ${error.message}]`);
            return false;
        }
    }

    /**
     * 通过用户名查找用户信息
     * @param {string} username - 目标用户名
     * @returns {Promise<{userId: string}>} 用户ID
     */
    async findUserByUsername(username) {
        try {
            const user = await this.client.v2.userByUsername(username);
            // console.log('用户信息:', user);
            // notificationManager.success(`获取用户信息成功 [用户 ${username}]`);
            return { userId: user.data.id, nickname: user.data.name };
        } catch (error) {
            console.error(`获取用户信息失败 [原因 ${error.message}]`);
            return false;
        }
    }

    /**
     * 关注指定用户
     * @param {string} username - 要关注的用户名
     * @returns {Promise<void>}
     */
    async follow(username) {
        try {
            const { userId } = await this.getCurrentUserProfile();
            const { userId: targetUserId } = await this.findUserByUsername(username);
            await this.client.v2.follow(userId, targetUserId);
            // notificationManager.success(`关注成功 [用户 ${username}]`);
            return true;
        } catch (error) {
            console.error(`关注失败 [原因 ${error.message}]`);
            return false;
        }
    }

    /**
     * 发送推文
     * @param {string} text - 推文内容
     * @returns {Promise<void>}
     */
    async tweet(text) {
        try {
            const { data: createdTweet } = await this.client.v2.tweet(text);
            const { id: tweetId } = createdTweet;
            // notificationManager.success(`发送推文成功 [推文ID ${tweetId}]`);
            return tweetId;
        } catch (error) {
            console.error(`发送推文失败 [原因 ${error.message}]`);
            return false;
        }
    }

    /**
     * 获取用户的最新推文（单次请求，节省API配额）
     * @param {string} username 用户名
     * @param {string} sinceId 起始推文ID
     * @param {number} maxTweets 最大获取推文数量，默认10条
     * @returns {Promise<Array>} 推文列表
     */
    async getUserTweets(username, lastCheckTime = null, maxTweets = 20) {
        try {
            if (!this.client) {
                throw new Error('Twitter客户端未初始化');
            }

            const { userId, nickname } = await this.findUserByUsername(username);

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
                    createdAt: tweet.createdAt,
                    url: `https://twitter.com/${username}/status/${tweet.id}`,
                    metrics: tweet.public_metrics
                };
            });

            // 按时间倒序排序（最新的在前面，符合用户期望）
            formattedTweets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // 由于API已经基于start_time过滤，返回的推文都应该是新的
            console.log(`获取完成 [用户: ${username}] [推文: ${formattedTweets.length}条] [API请求: 1次]`);
            return formattedTweets;

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
                return await this.getUserTweets(username, sinceId, maxTweets);
            }

            throw error;
        }
    }
}
