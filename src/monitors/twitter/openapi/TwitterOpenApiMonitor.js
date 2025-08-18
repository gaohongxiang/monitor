/**
 * Twitter OpenAPI 监控器
 * 使用Cookie认证模式监控Twitter用户推文
 */
import { BaseMonitor } from '../../base/BaseMonitor.js';
import { TwitterSharedService } from '../shared/index.js';
import { TwitterOpenApi } from 'twitter-openapi-typescript';

/**
 * Cookie管理器
 */
class TwitterCookieManager {
    constructor(authToken, ct0) {
        this.authToken = authToken;
        this.ct0 = ct0;
        this.lastValidation = null;
        this.lastCt0Update = null;
    }

    /**
     * 验证Cookie有效性
     */
    async validateCookies(api) {
        try {
            console.log('🔍 验证Cookie有效性...');

            const client = await api.getClientFromCookies({
                auth_token: this.authToken,
                ct0: this.ct0
            });

            // 尝试获取配置的第一个用户信息来验证
            const testUser = this.monitoredUsers[0] || 'binancezh';
            const response = await client.getUserApi()
                .getUserByScreenName({ screenName: testUser });

            if (response.data?.user?.legacy) {
                this.lastValidation = new Date();
                console.log('✅ Cookie验证成功');

                // 检查并更新ct0
                this.updateCt0FromResponse(response);
                return true;
            } else {
                throw new Error('无法获取用户数据');
            }
        } catch (error) {
            console.error('❌ Cookie验证失败:', error.message);
            return false;
        }
    }

    /**
     * 从响应中更新ct0
     */
    updateCt0FromResponse(response) {
        const newCt0 = response.header?.ct0;
        if (newCt0 && newCt0 !== this.ct0) {
            console.log('🔄 自动更新ct0令牌');
            this.ct0 = newCt0;
            this.lastCt0Update = new Date();

            // 自动保存新的ct0到数据库
            // TODO: 实现自动保存到数据库的逻辑
        }
    }

    /**
     * 执行认证请求并自动更新ct0
     */
    async makeAuthenticatedRequest(requestFn) {
        try {
            const response = await requestFn();

            // 自动更新ct0
            this.updateCt0FromResponse(response);

            return response;
        } catch (error) {
            if (error.message.includes('unauthorized') ||
                error.message.includes('forbidden') ||
                error.message.includes('authentication')) {
                throw new CookieExpiredError('认证Cookie已过期: ' + error.message);
            }
            throw error;
        }
    }

    /**
     * 获取当前Cookie状态
     */
    getStatus() {
        return {
            hasAuthToken: !!this.authToken,
            hasCt0: !!this.ct0,
            lastValidation: this.lastValidation,
            lastCt0Update: this.lastCt0Update,
            authTokenAge: this.authToken ? 'unknown' : null,
            isHealthy: this.lastValidation && (Date.now() - this.lastValidation.getTime()) < 24 * 60 * 60 * 1000 // 24小时内验证过
        };
    }
}

/**
 * Cookie过期错误
 */
class CookieExpiredError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CookieExpiredError';
    }
}

export class TwitterOpenApiMonitor extends BaseMonitor {
    constructor(sharedServices, config) {
        super('twitter-openapi', sharedServices, config);

        this.api = null;
        this.client = null;
        this.monitoredUsers = this.parseMonitoredUsers();
        this.checkInterval = this.config.checkInterval || 300; // 5分钟
        this.intervalId = null;
        this.lastTweetIds = new Map(); // 存储每个用户的最后推文ID

        // Cookie管理
        this.mode = this.parseMode();
        this.cookieManager = null;
        this.cookieHealthCheckInterval = null;
        this.cookieReminderInterval = null;

        // 初始化共享服务
        this.twitterService = new TwitterSharedService();

        this.logConfiguration();
    }

    /**
     * 解析监控用户列表
     */
    parseMonitoredUsers() {
        // 从环境变量获取
        if (process.env.TWITTER_MONITOR_USERS) {
            return process.env.TWITTER_MONITOR_USERS.split(',').map(u => u.trim());
        }

        // 从配置获取
        if (this.config.monitoredUsers && Array.isArray(this.config.monitoredUsers)) {
            return this.config.monitoredUsers;
        }

        // 默认用户（如果没有配置）
        return ['binancezh'];
    }

    /**
     * 解析运行模式
     */
    parseMode() {
        // 只支持认证模式
        return 'authenticated';
    }

    /**
     * 打印配置信息
     */
    logConfiguration() {
        console.log('\n📊 Twitter OpenAPI 监控器配置:');
        console.log(`   监控模式: 认证模式 (Authenticated)`);
        console.log(`   检查间隔: ${this.checkInterval}秒`);
        console.log(`   监控用户: ${this.monitoredUsers.join(', ')}`);
        console.log(`   代理设置: ${process.env.TWITTER_OPENAPI_PROXY || '未配置'}`);
        console.log(`   凭证管理: 自动检测数据库中的Cookie用户`);
        console.log(`   CSRF令牌: 自动管理和刷新`);
    }

    /**
     * 初始化监控器
     */
    async initialize() {
        try {
            console.log('🔧 初始化 Twitter OpenAPI...');

            // 初始化共享服务
            await this.twitterService.initialize();

            // 从数据库恢复最后推文ID
            this.lastTweetIds = await this.twitterService.loadLastTweetIdsFromDatabase(this.monitoredUsers);

            this.api = new TwitterOpenApi();

            // 如果配置了代理
            if (process.env.TWITTER_OPENAPI_PROXY) {
                console.log(`🌐 配置代理: ${process.env.TWITTER_OPENAPI_PROXY}`);
                // 这里可以配置代理，具体实现取决于库的支持
            }

            // 初始化认证模式
            await this.initializeAuthenticatedMode();

            // 验证连接
            await this.validateConnection();

            return true;
        } catch (error) {
            console.error('❌ Twitter OpenAPI 初始化失败:', error.message);
            this.logger.error('Twitter OpenAPI 初始化失败', { error: error.message });
            return false;
        }
    }



    /**
     * 初始化认证模式
     */
    async initializeAuthenticatedMode() {
        // 自动检测可用的Cookie用户
        const availableUsers = await this.twitterService.credentialsManager.getAvailableOpenApiUsers();

        if (availableUsers.length === 0) {
            throw new Error(`没有可用的OpenAPI凭证用户。

🔧 解决方案:
1. 使用凭证管理脚本添加Cookie: npm run twitter:openapi:credentials
2. 选择 "1. 添加/更新用户凭证"
3. 输入提供Cookie的用户名和凭证信息

💡 提示: Cookie用户不需要与监控用户相同，一个Cookie账号可以监控多个用户`);
        }

        // 选择最佳的Cookie用户（优先选择CT0令牌较新的）
        const cookieUser = availableUsers[0].username;
        const isFresh = availableUsers[0].isFresh;

        console.log(`🔍 自动选择Cookie用户: ${cookieUser} ${isFresh ? '(令牌新鲜)' : '(令牌可能需要刷新)'}`);

        if (!isFresh) {
            console.log(`⚠️  Cookie用户 ${cookieUser} 的CT0令牌超过20小时，建议刷新`);
        }

        // 获取凭证
        const credentials = await this.twitterService.credentialsManager.getOpenApiCredentials(cookieUser);
        if (!credentials || !credentials.openapi_auth_token || !credentials.openapi_ct0_token) {
            throw new Error(`Cookie用户 ${cookieUser} 的凭证不完整，请使用凭证管理脚本更新: npm run twitter:openapi:credentials`);
        }

        const authToken = credentials.openapi_auth_token;
        const ct0Token = credentials.openapi_ct0_token;

        // 创建Cookie管理器
        this.cookieManager = new TwitterCookieManager(authToken, ct0Token);
        this.cookieUser = cookieUser; // 保存Cookie用户名

        // 验证Cookie有效性
        const isValid = await this.cookieManager.validateCookies(this.api);
        if (!isValid) {
            throw new Error(`Cookie用户 ${cookieUser} 的Cookie验证失败，请使用凭证管理脚本更新: npm run twitter:openapi:credentials`);
        }

        // 初始化认证客户端
        this.client = await this.api.getClientFromCookies({
            auth_token: this.cookieManager.authToken,
            ct0: this.cookieManager.ct0
        });

        console.log(`✅ Twitter OpenAPI 认证模式初始化成功`);
        console.log(`   Cookie用户: ${cookieUser}`);
        console.log(`   监控用户: ${this.monitoredUsers.join(', ')}`);

        // 启动Cookie健康检查
        this.startCookieHealthCheck();

        // 启动定期提醒
        this.startCookieReminder();
    }

    /**
     * 验证连接
     */
    async validateConnection() {
        try {
            console.log('🔗 验证 Twitter OpenAPI 连接...');

            // 使用配置的第一个用户验证连接
            const testUser = this.monitoredUsers[0];
            console.log(`   验证用户: @${testUser}`);

            const response = await this.client.getUserApi()
                .getUserByScreenName({ screenName: testUser });

            if (response.data?.user?.legacy) {
                console.log('✅ 连接验证成功');
                console.log(`   用户: ${response.data.user.legacy.name} (@${response.data.user.legacy.screenName})`);
                console.log(`   关注者: ${response.data.user.legacy.followersCount}`);
            } else if (response.data?.user) {
                console.log('✅ 连接验证成功（数据结构异常但可用）');
            } else {
                throw new Error('无法获取用户数据');
            }
        } catch (error) {
            console.error('❌ 连接验证失败:', error.message);
            throw error;
        }
    }

    /**
     * 启动监控
     */
    async onStart() {
        console.log('🚀 启动 Twitter OpenAPI 监控...');

        // 立即执行一次检查
        await this.performCheck();

        // 启动定时检查
        this.intervalId = setInterval(async () => {
            await this.performCheck();
        }, this.checkInterval * 1000);

        console.log(`⏰ 定时检查已启动，间隔: ${this.checkInterval}秒`);
    }

    /**
     * 停止监控
     */
    async onStop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // 停止Cookie相关定时器
        this.stopCookieTimers();

        console.log('⏹️  Twitter OpenAPI 监控已停止');
    }

    /**
     * 启动Cookie健康检查
     */
    startCookieHealthCheck() {
        // 每2小时检查一次Cookie健康状态
        this.cookieHealthCheckInterval = setInterval(async () => {
            try {
                console.log('🔍 执行Cookie健康检查...');
                const isValid = await this.cookieManager.validateCookies(this.api);

                if (!isValid) {
                    console.error('❌ Cookie健康检查失败');
                    await this.handleCookieFailure('Cookie健康检查失败');
                } else {
                    console.log('✅ Cookie健康检查通过');
                }
            } catch (error) {
                console.error('❌ Cookie健康检查异常:', error.message);
                await this.handleCookieFailure('Cookie健康检查异常: ' + error.message);
            }
        }, 2 * 60 * 60 * 1000); // 2小时

        console.log('⏰ Cookie健康检查已启动 (每2小时)');
    }

    /**
     * 启动Cookie定期提醒
     */
    startCookieReminder() {
        // 每2周提醒检查Cookie状态
        this.cookieReminderInterval = setInterval(async () => {
            const status = this.cookieManager.getStatus();
            const message = `🔔 Twitter OpenAPI Cookie定期检查提醒

📊 当前状态:
- 认证令牌: ${status.hasAuthToken ? '✅ 已配置' : '❌ 未配置'}
- CSRF令牌: ${status.hasCt0 ? '✅ 已配置' : '❌ 未配置'}
- 最后验证: ${status.lastValidation ? status.lastValidation.toLocaleString('zh-CN') : '从未验证'}
- 健康状态: ${status.isHealthy ? '✅ 健康' : '⚠️ 需要关注'}

💡 建议: 请检查Twitter账号状态，确保Cookie仍然有效。如有异常请及时更新配置。

🔗 模块: Twitter OpenAPI 监控器`;

            await this.sendNotification(message, '定期提醒');
        }, 14 * 24 * 60 * 60 * 1000); // 14天

        console.log('📅 Cookie定期提醒已启动 (每2周)');
    }

    /**
     * 停止Cookie相关定时器
     */
    stopCookieTimers() {
        if (this.cookieHealthCheckInterval) {
            clearInterval(this.cookieHealthCheckInterval);
            this.cookieHealthCheckInterval = null;
            console.log('⏹️  Cookie健康检查已停止');
        }

        if (this.cookieReminderInterval) {
            clearInterval(this.cookieReminderInterval);
            this.cookieReminderInterval = null;
            console.log('⏹️  Cookie定期提醒已停止');
        }
    }

    /**
     * 处理Cookie失败
     */
    async handleCookieFailure(reason) {
        console.error('🚨 Cookie失败处理:', reason);

        // 发送失败通知
        await this.sendCookieFailureNotification(reason);

        // 停止当前模块
        await this.stop();

        console.log('⏹️  由于Cookie失败，模块已停止运行');
    }

    /**
     * 发送Cookie失败通知
     */
    async sendCookieFailureNotification(reason) {
        try {
            const message = `🚨 Twitter OpenAPI Cookie失败通知

❌ 失败原因: ${reason}

📊 影响范围:
- Twitter OpenAPI 监控器已停止运行
- 无法获取Twitter用户数据和推文
- 需要手动更新Cookie配置

🔧 解决方案:
1. 登录Twitter账号获取新的Cookie
2. 使用凭证管理脚本更新Cookie:
   npm run twitter:openapi:credentials
3. 重启监控系统

⏰ 时间: ${new Date().toLocaleString('zh-CN')}
🔗 模块: Twitter OpenAPI 监控器`;

            await this.sendNotification(message, 'Cookie失败');
        } catch (error) {
            console.error('❌ 发送Cookie失败通知失败:', error.message);
        }
    }

    /**
     * 发送通知的统一方法
     */
    async sendNotification(message, type = '通知') {
        try {
            if (this.sharedServices && this.sharedServices.notifier) {
                await this.sharedServices.notifier.sendToRecipients(message, {
                    recipients: ['dingtalk']
                });
                console.log(`📢 已发送${type}通知`);
            } else {
                console.warn('⚠️  通知器未配置，跳过通知发送');
                console.log(`📄 ${type}内容:`, message);
            }
        } catch (error) {
            console.error(`❌ 发送${type}通知失败:`, error.message);
        }
    }

    /**
     * 执行检查
     */
    async performCheck() {
        console.log('📊 执行 Twitter OpenAPI 检查...');
        this.statistics.lastActivity = new Date();

        let successCount = 0;
        let errorCount = 0;

        for (const username of this.monitoredUsers) {
            try {
                await this.checkUser(username);
                successCount++;
            } catch (error) {
                errorCount++;
                console.error(`❌ 检查用户 ${username} 失败:`, error.message);
                this.logger.error(`检查用户失败`, {
                    username,
                    error: error.message
                });
            }
        }

        console.log(`✅ 检查完成: 成功 ${successCount}, 失败 ${errorCount}`);
    }

    /**
     * 检查单个用户
     */
    async checkUser(username) {
        try {
            console.log(`🔍 检查用户: @${username}`);

            // 获取用户信息
            const userResponse = await this.client.getUserApi()
                .getUserByScreenName({ screenName: username });

            const user = userResponse.data?.user;
            const userLegacy = user?.legacy;

            if (!user || !userLegacy) {
                throw new Error(`无法获取用户 @${username} 的信息`);
            }

            console.log(`   用户名: ${userLegacy.name}`);
            console.log(`   关注者: ${userLegacy.followersCount}`);
            console.log(`   推文数: ${userLegacy.statusesCount}`);
            console.log(`   用户ID: ${user.restId}`);

            // 构建完整的用户信息对象
            const userInfo = {
                ...userLegacy,
                restId: user.restId,
                id: user.restId,
                username: username, // 添加用户名字段
                screen_name: userLegacy.screenName // 备用字段
            };

            // 尝试获取用户最新推文
            await this.checkUserTweets(username, userInfo);

        } catch (error) {
            if (error.message.includes('authorization') || error.message.includes('protected')) {
                console.warn(`⚠️  用户 @${username} 可能是受保护账号或需要认证访问`);
            } else if (error.message.includes('suspended')) {
                console.warn(`⚠️  用户 @${username} 账号已被暂停`);
            } else if (error.message.includes('not found')) {
                console.warn(`⚠️  用户 @${username} 不存在`);
            } else {
                throw error;
            }
        }
    }

    /**
     * 检查用户推文
     */
    async checkUserTweets(username, userInfo) {
        try {
            console.log(`   📝 获取 @${username} 的最新推文...`);

            // 首先获取用户ID（如果还没有的话）
            let userId = userInfo.restId || userInfo.id;

            if (!userId) {
                console.log(`   ⚠️  无法获取用户 @${username} 的ID，跳过推文检查`);
                return;
            }

            // 获取上次处理的推文ID
            const lastTweetId = this.lastTweetIds.get(username);

            // 使用共享服务获取新推文
            const tweets = await this.twitterService.getNewTweets(
                this.client,
                username,
                lastTweetId,
                { count: 10, includeReplies: false, includeRetweets: false }
            );

            if (tweets.length > 0) {
                console.log(`   📊 获取到 ${tweets.length} 条新推文`);

                // 使用共享服务批量处理推文
                const result = await this.twitterService.processNewTweetsForUser(
                    username,
                    tweets,
                    userInfo,
                    this.lastTweetIds,
                    this  // 始终传入this，因为this有sendTweetNotification方法
                );

                console.log(`   ✅ 处理完成: ${result.processedCount}/${result.totalTweets} 条推文`);
            } else {
                console.log(`   📭 没有新推文`);
            }

        } catch (error) {
            if (error.message.includes('authorization') || error.message.includes('Unauthorized')) {
                console.log(`   ⚠️  获取 @${username} 推文需要认证，跳过推文检查`);
            } else if (error.message.includes('Rate limit')) {
                console.log(`   ⚠️  API请求频率限制，稍后重试`);
            } else {
                console.error(`   ❌ 获取 @${username} 推文失败:`, error.message);
                console.error(`   详细错误:`, error);
            }
        }
    }

    /**
     * 发送推文通知 (兼容共享服务接口)
     */
    async sendTweetNotification(username, formattedTweet, userInfo) {
        try {
            // formattedTweet 是共享服务格式化后的推文对象
            const message = `🐦 Twitter OpenAPI 监控到新推文

👤 用户: ${userInfo.name || username} (@${username})
📝 内容: ${formattedTweet.text || '无文本内容'}
🕒 时间: ${formattedTweet.createdAt || '未知时间'}
🔗 链接: ${formattedTweet.url || `https://twitter.com/${username}/status/${formattedTweet.id}`}

� 来源: Twitter OpenAPI (认证模式)`;

            // 使用统一通知器发送消息
            if (this.sharedServices && this.sharedServices.notifier) {
                await this.sharedServices.notifier.sendToRecipients(message, {
                    recipients: ['dingtalk']
                });
                console.log(`📢 已发送 @${username} 的推文通知`);
            } else {
                console.warn('⚠️  通知器未配置，跳过通知发送');
                console.log('📄 通知内容:', message);
            }

        } catch (error) {
            console.error('❌ 发送推文通知失败:', error.message);
        }
    }

    /**
     * 健康检查
     */
    async onHealthCheck() {
        try {
            if (!this.client || !this.cookieManager) {
                console.warn('⚠️  Twitter OpenAPI 客户端或Cookie管理器未初始化');
                return false;
            }

            // 使用Cookie管理器进行健康检查
            const isValid = await this.cookieManager.validateCookies(this.api);
            if (!isValid) {
                console.warn('⚠️  Twitter OpenAPI 健康检查失败：Cookie无效');
                // Cookie失效时停止模块
                await this.handleCookieFailure('健康检查发现Cookie失效');
                return false;
            }

            return true;
        } catch (error) {
            console.warn('⚠️  Twitter OpenAPI 健康检查失败:', error.message);
            // 健康检查异常也可能是Cookie问题
            await this.handleCookieFailure('健康检查异常: ' + error.message);
            return false;
        }
    }



    /**
     * 获取监控器状态
     */
    getStatus() {
        const baseStatus = super.getStatus();
        const sharedReport = this.twitterService.generateStatusReport(
            this.monitoredUsers,
            this.lastTweetIds,
            'twitter-openapi'
        );

        return {
            ...baseStatus,
            ...sharedReport,
            mode: 'authenticated',
            checkInterval: this.checkInterval,
            cookieUser: this.cookieUser || 'auto-detected'
        };
    }
}