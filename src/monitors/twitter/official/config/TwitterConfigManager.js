/**
 * Twitter配置管理器
 * 处理Twitter模块的配置验证、解析和管理
 */
export class TwitterConfigManager {
    constructor(config) {
        this.config = config;
        this.validatedCredentials = null;
        this.monitoredUsers = null;
    }

    /**
     * 验证Twitter配置
     * @returns {boolean} 配置是否有效
     */
    validate() {
        try {
            // 检查基本配置
            if (!this.config) {
                console.log('❌ Twitter模块配置为空');
                return false;
            }

            // 检查API凭证
            if (!this.config.apiCredentials || this.config.apiCredentials.length === 0) {
                console.log('❌ Twitter模块缺少API凭证配置');
                console.log('💡 请在.env文件中配置API_CREDENTIALS');
                return false;
            }

            // 验证每个凭证的必需字段
            const requiredFields = [
                'twitterClientId',
                'twitterClientSecret', 
                'twitterRedirectUri',
                'twitterUserName',
                'monitorUser'
            ];

            for (let i = 0; i < this.config.apiCredentials.length; i++) {
                const credential = this.config.apiCredentials[i];
                
                for (const field of requiredFields) {
                    if (!credential[field]) {
                        console.log(`❌ 凭证 ${i + 1} 缺少必需字段: ${field}`);
                        console.log('💡 请检查API_CREDENTIALS配置格式');
                        return false;
                    }
                }

                // 验证可选字段的默认值
                if (!credential.dailyRequestsPerApi) {
                    credential.dailyRequestsPerApi = 3; // 默认每日3次请求
                }

                if (!credential.browserId && !credential.socksProxyUrl) {
                    console.log(`⚠️  凭证 ${i + 1} 缺少browserId和socksProxyUrl，可能影响认证`);
                }
            }

            console.log(`✅ Twitter配置验证通过，共 ${this.config.apiCredentials.length} 个API凭证`);
            return true;

        } catch (error) {
            console.error('❌ Twitter配置验证失败:', error.message);
            return false;
        }
    }

    /**
     * 获取API凭证列表
     * @returns {Array} API凭证数组
     */
    getApiCredentials() {
        if (!this.validatedCredentials) {
            this.validatedCredentials = this.config.apiCredentials || [];
        }
        return this.validatedCredentials;
    }

    /**
     * 获取监控用户列表
     * @returns {Array} 监控用户数组
     */
    getMonitoredUsers() {
        if (!this.monitoredUsers) {
            const credentials = this.getApiCredentials();
            this.monitoredUsers = [...new Set(credentials.map(cred => cred.monitorUser))];
        }
        return this.monitoredUsers;
    }

    /**
     * 根据监控用户获取对应的凭证
     * @param {string} monitorUser - 监控用户名
     * @returns {Array} 该用户对应的凭证列表
     */
    getCredentialsForUser(monitorUser) {
        const credentials = this.getApiCredentials();
        return credentials.filter(cred => cred.monitorUser === monitorUser);
    }

    /**
     * 根据Twitter用户名获取凭证
     * @param {string} twitterUserName - Twitter用户名
     * @returns {Object|null} 凭证对象
     */
    getCredentialByTwitterUser(twitterUserName) {
        const credentials = this.getApiCredentials();
        return credentials.find(cred => cred.twitterUserName === twitterUserName) || null;
    }

    /**
     * 获取配置统计信息
     * @returns {Object} 统计信息
     */
    getConfigStats() {
        const credentials = this.getApiCredentials();
        const monitoredUsers = this.getMonitoredUsers();
        
        // 按监控用户分组统计
        const userStats = {};
        monitoredUsers.forEach(user => {
            const userCredentials = this.getCredentialsForUser(user);
            userStats[user] = {
                credentialCount: userCredentials.length,
                twitterUsers: userCredentials.map(cred => cred.twitterUserName),
                totalDailyRequests: userCredentials.reduce((sum, cred) => sum + (cred.dailyRequestsPerApi || 3), 0)
            };
        });

        return {
            totalCredentials: credentials.length,
            monitoredUsersCount: monitoredUsers.length,
            monitoredUsers: monitoredUsers,
            userStats: userStats,
            totalDailyRequests: credentials.reduce((sum, cred) => sum + (cred.dailyRequestsPerApi || 3), 0)
        };
    }

    /**
     * 验证单个凭证的完整性
     * @param {Object} credential - 凭证对象
     * @returns {Object} 验证结果
     */
    validateCredential(credential) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        const requiredFields = [
            'twitterClientId',
            'twitterClientSecret',
            'twitterRedirectUri', 
            'twitterUserName',
            'monitorUser'
        ];

        // 检查必需字段
        for (const field of requiredFields) {
            if (!credential[field]) {
                result.valid = false;
                result.errors.push(`缺少必需字段: ${field}`);
            }
        }

        // 检查可选字段
        if (!credential.browserId) {
            result.warnings.push('缺少browserId，可能影响OAuth认证');
        }

        if (!credential.socksProxyUrl) {
            result.warnings.push('缺少socksProxyUrl，可能影响网络连接');
        }

        // 检查数值字段
        if (credential.dailyRequestsPerApi && 
            (isNaN(credential.dailyRequestsPerApi) || credential.dailyRequestsPerApi < 1)) {
            result.errors.push('dailyRequestsPerApi必须是大于0的数字');
            result.valid = false;
        }

        // 检查URL格式
        if (credential.twitterRedirectUri && !this.isValidUrl(credential.twitterRedirectUri)) {
            result.warnings.push('twitterRedirectUri格式可能不正确');
        }

        if (credential.socksProxyUrl && !this.isValidProxyUrl(credential.socksProxyUrl)) {
            result.warnings.push('socksProxyUrl格式可能不正确');
        }

        return result;
    }

    /**
     * 验证URL格式
     * @private
     * @param {string} url - URL字符串
     * @returns {boolean} 是否为有效URL
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 验证代理URL格式
     * @private
     * @param {string} proxyUrl - 代理URL
     * @returns {boolean} 是否为有效代理URL
     */
    isValidProxyUrl(proxyUrl) {
        try {
            const url = new URL(proxyUrl);
            return url.protocol === 'socks5:' || url.protocol === 'socks4:' || url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * 获取调度配置
     * @returns {Object} 调度配置
     */
    getScheduleConfig() {
        return {
            enabled: this.config.schedule?.enabled !== false, // 默认启用
            checkInterval: this.config.schedule?.checkInterval || 300, // 默认5分钟
            maxConcurrent: this.config.schedule?.maxConcurrent || 3, // 默认最大3个并发
            retryAttempts: this.config.schedule?.retryAttempts || 2, // 默认重试2次
            retryDelay: this.config.schedule?.retryDelay || 60 // 默认重试延迟60秒
        };
    }

    /**
     * 获取通知配置
     * @returns {Object} 通知配置
     */
    getNotificationConfig() {
        return {
            enabled: this.config.notification?.enabled !== false, // 默认启用
            includeMetrics: this.config.notification?.includeMetrics !== false, // 默认包含指标
            maxTextLength: this.config.notification?.maxTextLength || 200, // 默认最大200字符
            sendErrors: this.config.notification?.sendErrors !== false // 默认发送错误通知
        };
    }

    /**
     * 显示配置摘要
     */
    displayConfigSummary() {
        const stats = this.getConfigStats();
        const scheduleConfig = this.getScheduleConfig();
        const notificationConfig = this.getNotificationConfig();

        console.log('\n📋 Twitter官方API配置摘要:');
        console.log(`   📊 API凭证数量: ${stats.totalCredentials}`);
        console.log(`   👥 监控用户数量: ${stats.monitoredUsersCount}`);
        console.log(`   📈 每日总请求限制: ${stats.totalDailyRequests}`);
        
        console.log('\n👥 监控用户详情:');
        Object.entries(stats.userStats).forEach(([user, userStat]) => {
            console.log(`   📌 @${user}: ${userStat.credentialCount}个凭证, ${userStat.totalDailyRequests}次/日`);
        });

        console.log('\n⏰ 调度配置:');
        console.log(`   🔄 检查间隔: ${scheduleConfig.checkInterval}秒`);
        console.log(`   🔀 最大并发: ${scheduleConfig.maxConcurrent}`);
        console.log(`   🔁 重试次数: ${scheduleConfig.retryAttempts}`);

        console.log('\n📢 通知配置:');
        console.log(`   📨 通知状态: ${notificationConfig.enabled ? '启用' : '禁用'}`);
        console.log(`   📊 包含指标: ${notificationConfig.includeMetrics ? '是' : '否'}`);
        console.log(`   📝 文本长度限制: ${notificationConfig.maxTextLength}字符`);
    }
}
