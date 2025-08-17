/**
 * Twitter OAuth2认证流程处理器
 * 专门处理OAuth2.0认证流程，获取和管理refresh token
 */
import { TwitterApi } from 'twitter-api-v2';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { BitBrowser } from '../utils/BitBrowser.js';

export class TwitterOAuth {
    /**
     * TwitterOAuth构造函数
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
     * 创建并初始化TwitterOAuth实例
     * @static
     * @param {Object} params - 初始化参数
     * @param {string} params.twitterClientId - 凭证Id
     * @param {string} params.twitterClientSecret - 凭证密钥
     * @param {string} params.browserId - 指纹浏览器Id
     * @param {string} params.socksProxyUrl - 代理
     * @returns {Promise<TwitterOAuth>} 初始化完成的实例
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

        // 创建TwitterOAuth实例
        const instance = new TwitterOAuth(browserUtil, proxy, client);

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

            console.log(`🔗 为用户 ${twitterUserName} 生成授权链接: ${url}`);

            // 使用浏览器自动化进行授权
            await this.page.goto(url);
            console.log('🌐 已打开授权页面，等待用户授权...');

            // 等待重定向到回调URL
            const response = await this.page.waitForURL(new RegExp(twitterRedirectUri), { timeout: 120000 });
            const callbackUrl = this.page.url();
            console.log(`✅ 获取到回调URL: ${callbackUrl}`);

            // 从回调URL中提取授权码
            const urlParams = new URLSearchParams(new URL(callbackUrl).search);
            const authCode = urlParams.get('code');
            const state = urlParams.get('state');

            if (!authCode) {
                throw new Error('未能从回调URL中获取授权码');
            }

            console.log(`🔑 获取到授权码: ${authCode.substring(0, 10)}...`);

            // 使用授权码获取访问令牌
            const tokenResponse = await this.client.loginWithOAuth2({
                code: authCode,
                codeVerifier: codeVerifier,
                redirectUri: twitterRedirectUri
            });

            console.log('🎉 OAuth2认证成功！');

            // 保存refresh token到数据库
            const refreshToken = tokenResponse.refreshToken;
            if (refreshToken) {
                await this.saveRefreshToken(twitterUserName, refreshToken, database);
                console.log(`💾 已保存 ${twitterUserName} 的refresh token到数据库`);
                return true;
            } else {
                console.error('❌ 未获取到refresh token');
                return false;
            }

        } catch (error) {
            console.error(`❌ OAuth2认证失败 (${twitterUserName}):`, error.message);
            return false;
        }
    }

    /**
     * 保存refresh token到数据库
     * @private
     * @param {string} twitterUserName - Twitter用户名
     * @param {string} refreshToken - 刷新令牌
     * @param {Object} database - 数据库管理器
     */
    async saveRefreshToken(twitterUserName, refreshToken, database) {
        const query = `
            INSERT INTO twitter_credentials (twitter_user_name, refresh_token, created_at, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (twitter_user_name)
            DO UPDATE SET 
                refresh_token = EXCLUDED.refresh_token,
                updated_at = CURRENT_TIMESTAMP
        `;

        await database.pool.query(query, [twitterUserName, refreshToken]);
    }

    /**
     * 清理资源
     */
    async cleanup() {
        if (this.browserUtil) {
            await this.browserUtil.cleanup();
        }
    }
}
