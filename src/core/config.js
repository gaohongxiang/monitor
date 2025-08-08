/**
 * 统一配置管理器
 * 支持多监控源的配置管理和验证
 */
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

export class UnifiedConfigManager {
    constructor() {
        this.config = null;
        this.moduleConfigs = new Map();
        this.configValidators = new Map();
        this.configTemplates = new Map();
        this.configWatchers = new Map();
        this.hotUpdateCallbacks = new Map();
        this.lastLoadTime = null;

        // 初始化配置验证器和模板
        this.initializeValidators();
        this.initializeTemplates();
    }

    /**
     * 初始化配置验证器
     */
    initializeValidators() {
        // Twitter模块验证器
        this.configValidators.set('twitter', {
            validate: (config) => {
                const errors = [];

                if (!config.apiCredentials || !Array.isArray(config.apiCredentials)) {
                    errors.push('apiCredentials必须是数组');
                } else if (config.apiCredentials.length === 0) {
                    errors.push('至少需要一个API凭证');
                } else {
                    config.apiCredentials.forEach((cred, index) => {
                        const requiredFields = ['xClientId', 'xClientSecret', 'xRedirectUri', 'xUserName', 'monitorUser'];
                        requiredFields.forEach(field => {
                            if (!cred[field]) {
                                errors.push(`凭证${index + 1}缺少必需字段: ${field}`);
                            }
                        });
                    });
                }

                if (config.monitorSettings) {
                    const { startTimeUTC8, endTimeUTC8, testIntervalMinutes, dailyRequestsPerApi } = config.monitorSettings;

                    if (startTimeUTC8 && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTimeUTC8)) {
                        errors.push('startTimeUTC8格式无效，应为HH:MM');
                    }

                    if (endTimeUTC8 && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(endTimeUTC8)) {
                        errors.push('endTimeUTC8格式无效，应为HH:MM');
                    }

                    if (testIntervalMinutes && (testIntervalMinutes < 1 || testIntervalMinutes > 60)) {
                        errors.push('testIntervalMinutes必须在1-60之间');
                    }

                    if (dailyRequestsPerApi && (dailyRequestsPerApi < 1 || dailyRequestsPerApi > 10)) {
                        errors.push('dailyRequestsPerApi必须在1-10之间');
                    }
                }

                return { isValid: errors.length === 0, errors };
            }
        });

        // 币安模块验证器
        this.configValidators.set('binance', {
            validate: (config) => {
                const errors = [];

                if (!config.restApiUrl) {
                    errors.push('restApiUrl是必需的');
                } else if (!config.restApiUrl.startsWith('http')) {
                    errors.push('restApiUrl必须是有效的HTTP URL');
                }

                if (config.websocketUrl && !config.websocketUrl.startsWith('ws')) {
                    errors.push('websocketUrl必须是有效的WebSocket URL');
                }

                if (config.checkInterval && (config.checkInterval < 10 || config.checkInterval > 300)) {
                    errors.push('checkInterval必须在10-300秒之间');
                }

                if (config.maxRetries && (config.maxRetries < 1 || config.maxRetries > 10)) {
                    errors.push('maxRetries必须在1-10之间');
                }

                if (config.keywords && !Array.isArray(config.keywords)) {
                    errors.push('keywords必须是数组');
                }

                if (config.languages && !Array.isArray(config.languages)) {
                    errors.push('languages必须是数组');
                }

                if (config.monitorTypes && !Array.isArray(config.monitorTypes)) {
                    errors.push('monitorTypes必须是数组');
                }

                return { isValid: errors.length === 0, errors };
            }
        });

        // 系统配置验证器
        this.configValidators.set('system', {
            validate: (config) => {
                const errors = [];

                if (!config.enabledModules || !Array.isArray(config.enabledModules)) {
                    errors.push('enabledModules必须是数组');
                }
                // 允许空的启用模块列表，所有模块默认关闭

                if (config.port && (config.port < 1000 || config.port > 65535)) {
                    errors.push('port必须在1000-65535之间');
                }

                const validLogLevels = ['error', 'warn', 'info', 'debug'];
                if (config.logLevel && !validLogLevels.includes(config.logLevel)) {
                    errors.push(`logLevel必须是以下之一: ${validLogLevels.join(', ')}`);
                }

                return { isValid: errors.length === 0, errors };
            }
        });

        // 共享配置验证器
        this.configValidators.set('shared', {
            validate: (config) => {
                const errors = [];

                if (!config.database || !config.database.url) {
                    errors.push('database.url是必需的');
                }

                if (!config.notification || !config.notification.dingtalk || !config.notification.dingtalk.accessToken) {
                    errors.push('notification.dingtalk.accessToken是必需的');
                }

                if (config.database.poolSize && (config.database.poolSize < 1 || config.database.poolSize > 50)) {
                    errors.push('database.poolSize必须在1-50之间');
                }

                if (config.database.timeout && (config.database.timeout < 1000 || config.database.timeout > 60000)) {
                    errors.push('database.timeout必须在1000-60000毫秒之间');
                }

                return { isValid: errors.length === 0, errors };
            }
        });
    }

    /**
     * 初始化配置模板
     */
    initializeTemplates() {
        // Twitter模块配置模板
        this.configTemplates.set('twitter', {
            enabled: false,
            type: 'social_media',
            apiCredentials: [
                {
                    monitorUser: 'example_user',
                    xClientId: 'your_client_id',
                    xClientSecret: 'your_client_secret',
                    xRedirectUri: 'your_redirect_uri',
                    xUserName: 'your_username',
                    bitbrowserId: 'your_browser_id',
                    socksProxyUrl: 'your_proxy_url'
                }
            ],
            monitorSettings: {
                startTimeUTC8: '09:00',
                endTimeUTC8: '23:00',
                startTime: '01:00',
                endTime: '15:00',
                testMode: false,
                testIntervalMinutes: 1,
                dailyRequestsPerApi: 3
            }
        });

        // 币安模块配置模板
        this.configTemplates.set('binance', {
            enabled: false,
            type: 'crypto_exchange',
            apiKey: 'your_binance_api_key',
            apiSecret: 'your_binance_api_secret',
            websocketUrl: 'wss://stream.binance.com:9443/ws/announcements',
            restApiUrl: 'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query',
            monitorTypes: ['new_listing', 'trading_pair', 'maintenance'],
            keywords: ['BTC', 'ETH', 'USDT'],
            checkInterval: 30,
            languages: ['zh-CN', 'en'],
            maxRetries: 3,
            retryDelay: 5000
        });

        // 系统配置模板
        this.configTemplates.set('system', {
            enabledModules: [],
            environment: 'development',
            logLevel: 'info',
            port: 3000,
            timezone: 'UTC'
        });

        // 共享配置模板
        this.configTemplates.set('shared', {
            database: {
                url: 'postgresql://user:password@localhost:5432/monitor_db',
                poolSize: 10,
                timeout: 30000
            },
            notification: {
                dingtalk: {
                    accessToken: 'your_dingtalk_access_token',
                    batchSize: 5,
                    retryAttempts: 3
                }
            },
            logging: {
                level: 'info',
                maxFileSize: '10MB',
                maxFiles: 5
            }
        });
    }

    /**
     * 加载所有配置
     * @returns {Object} 完整配置对象
     */
    loadConfig() {
        try {
            // 加载系统级配置
            const systemConfig = this.loadSystemConfig();

            // 加载启用的监控模块配置
            const enabledModules = this.getEnabledModules();
            const moduleConfigs = {};

            for (const moduleName of enabledModules) {
                moduleConfigs[moduleName] = this.loadModuleConfig(moduleName);
            }

            this.config = {
                system: systemConfig,
                modules: moduleConfigs,
                shared: this.loadSharedConfig()
            };

            this.lastLoadTime = new Date();
            console.log('✅ 统一配置加载成功');
            this.validateConfig();
            return this.config;
        } catch (error) {
            console.error('❌ 加载配置失败:', error.message);
            throw error;
        }
    }

    /**
     * 加载系统级配置
     * @returns {Object} 系统配置
     */
    loadSystemConfig() {
        return {
            enabledModules: this.getEnabledModules(),
            environment: process.env.NODE_ENV || 'development',
            logLevel: process.env.LOG_LEVEL || 'info',
            port: process.env.PORT || 3000,
            timezone: 'UTC'
        };
    }

    /**
     * 获取启用的监控模块列表
     * @returns {Array<string>} 启用的模块名称列表
     */
    getEnabledModules() {
        const enabledModules = [];

        // 检查TWITTER_ENABLED环境变量，只有明确设置为'true'才启用
        if (process.env.TWITTER_ENABLED === 'true') {
            enabledModules.push('twitter');
        }

        // 检查BINANCE_ENABLED环境变量，只有明确设置为'true'才启用
        if (process.env.BINANCE_ENABLED === 'true') {
            enabledModules.push('binance');
        }

        // 默认情况下所有模块都是关闭的，不提供回退机制
        // 如果没有任何模块被明确启用，返回空数组
        return enabledModules;
    }

    /**
     * 加载指定模块的配置
     * @param {string} moduleName - 模块名称
     * @returns {Object} 模块配置
     */
    loadModuleConfig(moduleName) {
        const moduleEnabled = process.env[`${moduleName.toUpperCase()}_ENABLED`] !== 'false';

        if (!moduleEnabled) {
            return { enabled: false };
        }

        switch (moduleName) {
            case 'twitter':
                return this.loadTwitterConfig();
            case 'binance':
                return this.loadBinanceConfig();
            default:
                console.warn(`未知的监控模块: ${moduleName}`);
                return { enabled: false };
        }
    }

    /**
     * 加载Twitter模块配置
     * @returns {Object} Twitter配置
     */
    loadTwitterConfig() {
        // 复用现有的Twitter配置逻辑
        const apiCredentialsJson = process.env.API_CREDENTIALS;
        if (!apiCredentialsJson) {
            throw new Error('Twitter模块需要API_CREDENTIALS环境变量');
        }

        try {
            const nestedConfig = JSON.parse(apiCredentialsJson);
            const apiCredentials = this.convertNestedToInternalFormat(nestedConfig);

            return {
                enabled: true,
                type: 'social_media',
                apiCredentials: apiCredentials,
                monitorSettings: {
                    startTimeUTC8: process.env.MONITOR_START_TIME || "09:00",
                    endTimeUTC8: process.env.MONITOR_END_TIME || "23:00",
                    startTime: this.convertUTC8ToUTC(process.env.MONITOR_START_TIME || "09:00"),
                    endTime: this.convertUTC8ToUTC(process.env.MONITOR_END_TIME || "23:00"),
                    testMode: process.env.TEST_MODE === 'true',
                    testIntervalMinutes: parseInt(process.env.TEST_INTERVAL || "1"),
                    dailyRequestsPerApi: parseInt(process.env.DAILY_REQUESTS_PER_API || "3")
                }
            };
        } catch (error) {
            throw new Error(`解析Twitter配置失败: ${error.message}`);
        }
    }

    /**
     * 加载币安模块配置
     * @returns {Object} 币安配置
     */
    loadBinanceConfig() {
        return {
            enabled: true,
            type: 'crypto_exchange',
            apiKey: process.env.BINANCE_API_KEY,
            apiSecret: process.env.BINANCE_API_SECRET,
            websocketUrl: process.env.BINANCE_WEBSOCKET_URL || 'wss://stream.binance.com:9443/ws/announcements',
            restApiUrl: process.env.BINANCE_REST_API_URL || 'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query',
            monitorTypes: (process.env.BINANCE_MONITOR_TYPES || 'new_listing,trading_pair,maintenance').split(','),
            keywords: (process.env.BINANCE_KEYWORDS || 'BTC,ETH,USDT').split(','),
            checkInterval: parseInt(process.env.BINANCE_CHECK_INTERVAL || '30'),
            languages: (process.env.BINANCE_LANGUAGES || 'zh-CN,en').split(','),
            maxRetries: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
            retryDelay: 5000,
            // DeepL翻译配置
            translation: {
                provider: 'deepl',
                apiKey: process.env.DEEPL_API_KEY
            }
        };
    }

    /**
     * 加载共享服务配置
     * @returns {Object} 共享配置
     */
    loadSharedConfig() {
        return {
            database: {
                url: process.env.DATABASE_URL,
                poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
                timeout: parseInt(process.env.DB_TIMEOUT || '30000')
            },
            notification: {
                dingtalk: {
                    accessToken: process.env.DINGTALK_ACCESS_TOKEN,
                    batchSize: parseInt(process.env.NOTIFICATION_BATCH_SIZE || '5'),
                    retryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3')
                }
            },
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                maxFileSize: process.env.LOG_MAX_FILE_SIZE || '10MB',
                maxFiles: parseInt(process.env.LOG_MAX_FILES || '5')
            }
        };
    }

    /**
     * 验证配置完整性
     */
    validateConfig() {
        const allErrors = [];

        // 验证系统配置
        const systemValidation = this.validateConfigSection('system', this.config.system);
        if (!systemValidation.isValid) {
            allErrors.push(...systemValidation.errors.map(err => `系统配置: ${err}`));
        }

        // 验证共享配置
        const sharedValidation = this.validateConfigSection('shared', this.config.shared);
        if (!sharedValidation.isValid) {
            allErrors.push(...sharedValidation.errors.map(err => `共享配置: ${err}`));
        }

        // 验证启用的模块配置
        for (const [moduleName, moduleConfig] of Object.entries(this.config.modules)) {
            if (moduleConfig.enabled) {
                const moduleValidation = this.validateConfigSection(moduleName, moduleConfig);
                if (!moduleValidation.isValid) {
                    allErrors.push(...moduleValidation.errors.map(err => `${moduleName}模块: ${err}`));
                }
            }
        }

        if (allErrors.length > 0) {
            throw new Error(`配置验证失败:\n${allErrors.join('\n')}`);
        }

        console.log(`✅ 配置验证通过，启用模块: ${Object.keys(this.config.modules).join(', ')}`);
    }

    /**
     * 验证配置段
     * @param {string} sectionName - 配置段名称
     * @param {Object} config - 配置对象
     * @returns {Object} 验证结果
     */
    validateConfigSection(sectionName, config) {
        const validator = this.configValidators.get(sectionName);
        if (!validator) {
            return { isValid: true, errors: [] };
        }

        return validator.validate(config);
    }

    /**
     * 独立验证模块配置
     * @param {string} moduleName - 模块名称
     * @param {Object} moduleConfig - 模块配置
     * @returns {Object} 验证结果
     */
    validateModuleConfigIndependent(moduleName, moduleConfig) {
        return this.validateConfigSection(moduleName, moduleConfig);
    }

    /**
     * 获取配置模板
     * @param {string} sectionName - 配置段名称
     * @returns {Object|null} 配置模板
     */
    getConfigTemplate(sectionName) {
        return this.configTemplates.get(sectionName) || null;
    }

    /**
     * 生成配置文件模板
     * @param {Array<string>} modules - 要包含的模块列表
     * @returns {Object} 完整的配置模板
     */
    generateConfigTemplate(modules = []) {
        const template = {
            system: this.getConfigTemplate('system'),
            shared: this.getConfigTemplate('shared'),
            modules: {}
        };

        // 更新系统配置中的启用模块
        template.system.enabledModules = modules;

        // 添加模块配置模板
        for (const moduleName of modules) {
            const moduleTemplate = this.getConfigTemplate(moduleName);
            if (moduleTemplate) {
                template.modules[moduleName] = moduleTemplate;
            }
        }

        return template;
    }

    /**
     * 注册配置热更新回调
     * @param {string} moduleName - 模块名称
     * @param {Function} callback - 回调函数
     */
    registerHotUpdateCallback(moduleName, callback) {
        if (!this.hotUpdateCallbacks.has(moduleName)) {
            this.hotUpdateCallbacks.set(moduleName, []);
        }
        this.hotUpdateCallbacks.get(moduleName).push(callback);
        console.log(`已注册 ${moduleName} 模块的配置热更新回调`);
    }

    /**
     * 取消注册配置热更新回调
     * @param {string} moduleName - 模块名称
     * @param {Function} callback - 回调函数
     */
    unregisterHotUpdateCallback(moduleName, callback) {
        const callbacks = this.hotUpdateCallbacks.get(moduleName);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
                console.log(`已取消注册 ${moduleName} 模块的配置热更新回调`);
            }
        }
    }

    /**
     * 热更新模块配置
     * @param {string} moduleName - 模块名称
     * @param {Object} newConfig - 新配置
     * @returns {Promise<boolean>} 是否更新成功
     */
    async hotUpdateModuleConfig(moduleName, newConfig) {
        try {
            console.log(`开始热更新 ${moduleName} 模块配置`);

            // 验证新配置
            const validation = this.validateModuleConfigIndependent(moduleName, newConfig);
            if (!validation.isValid) {
                throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
            }

            // 备份旧配置
            const oldConfig = this.config.modules[moduleName];

            // 更新配置
            this.config.modules[moduleName] = { ...newConfig };

            // 通知所有注册的回调
            const callbacks = this.hotUpdateCallbacks.get(moduleName) || [];
            const updateResults = [];

            for (const callback of callbacks) {
                try {
                    const result = await callback(newConfig, oldConfig);
                    updateResults.push({ success: true, result });
                } catch (error) {
                    console.error(`配置热更新回调失败: ${moduleName}`, error.message);
                    updateResults.push({ success: false, error: error.message });
                }
            }

            // 检查是否所有回调都成功
            const failedCallbacks = updateResults.filter(r => !r.success);
            if (failedCallbacks.length > 0) {
                // 回滚配置
                this.config.modules[moduleName] = oldConfig;
                throw new Error(`配置热更新失败，已回滚: ${failedCallbacks.map(f => f.error).join(', ')}`);
            }

            console.log(`✅ ${moduleName} 模块配置热更新成功`);
            return true;

        } catch (error) {
            console.error(`❌ ${moduleName} 模块配置热更新失败:`, error.message);
            return false;
        }
    }

    /**
     * 热更新系统配置
     * @param {Object} newSystemConfig - 新系统配置
     * @returns {Promise<boolean>} 是否更新成功
     */
    async hotUpdateSystemConfig(newSystemConfig) {
        try {
            console.log('开始热更新系统配置');

            // 验证新配置
            const validation = this.validateConfigSection('system', newSystemConfig);
            if (!validation.isValid) {
                throw new Error(`系统配置验证失败: ${validation.errors.join(', ')}`);
            }

            // 备份旧配置
            const oldConfig = this.config.system;

            // 更新配置
            this.config.system = { ...newSystemConfig };

            // 如果启用的模块发生变化，需要重新加载模块配置
            const oldModules = oldConfig.enabledModules || [];
            const newModules = newSystemConfig.enabledModules || [];

            if (JSON.stringify(oldModules.sort()) !== JSON.stringify(newModules.sort())) {
                console.log('检测到启用模块变化，重新加载模块配置');

                // 移除不再启用的模块配置
                for (const moduleName of oldModules) {
                    if (!newModules.includes(moduleName)) {
                        delete this.config.modules[moduleName];
                        console.log(`移除模块配置: ${moduleName}`);
                    }
                }

                // 添加新启用的模块配置
                for (const moduleName of newModules) {
                    if (!oldModules.includes(moduleName)) {
                        try {
                            this.config.modules[moduleName] = this.loadModuleConfig(moduleName);
                            console.log(`添加模块配置: ${moduleName}`);
                        } catch (error) {
                            console.error(`加载新模块配置失败: ${moduleName}`, error.message);
                            // 回滚系统配置
                            this.config.system = oldConfig;
                            throw error;
                        }
                    }
                }
            }

            // 通知系统配置更新回调
            const callbacks = this.hotUpdateCallbacks.get('system') || [];
            for (const callback of callbacks) {
                try {
                    await callback(newSystemConfig, oldConfig);
                } catch (error) {
                    console.error('系统配置热更新回调失败', error.message);
                }
            }

            console.log('✅ 系统配置热更新成功');
            return true;

        } catch (error) {
            console.error('❌ 系统配置热更新失败:', error.message);
            return false;
        }
    }

    /**
     * 重新加载配置
     * @returns {Promise<boolean>} 是否重新加载成功
     */
    async reloadConfig() {
        try {
            console.log('开始重新加载配置');

            // 备份当前配置
            const backupConfig = JSON.parse(JSON.stringify(this.config));

            try {
                // 重新加载配置
                this.loadConfig();

                // 通知所有模块配置已重新加载
                for (const [moduleName, callbacks] of this.hotUpdateCallbacks.entries()) {
                    const newConfig = this.config.modules[moduleName];
                    const oldConfig = backupConfig.modules[moduleName];

                    if (newConfig && JSON.stringify(newConfig) !== JSON.stringify(oldConfig)) {
                        for (const callback of callbacks) {
                            try {
                                await callback(newConfig, oldConfig);
                            } catch (error) {
                                console.error(`配置重新加载回调失败: ${moduleName}`, error.message);
                            }
                        }
                    }
                }

                console.log('✅ 配置重新加载成功');
                return true;

            } catch (error) {
                // 恢复备份配置
                this.config = backupConfig;
                throw error;
            }

        } catch (error) {
            console.error('❌ 配置重新加载失败:', error.message);
            return false;
        }
    }

    /**
     * 获取配置变更历史
     * @returns {Array} 配置变更历史
     */
    getConfigChangeHistory() {
        // 这里可以实现配置变更历史记录
        // 目前返回基本信息
        return {
            lastLoadTime: this.lastLoadTime,
            loadCount: this.loadCount || 1,
            hotUpdateCount: this.hotUpdateCount || 0
        };
    }

    /**
     * 导出当前配置
     * @param {boolean} includeSensitive - 是否包含敏感信息
     * @returns {Object} 配置对象
     */
    exportConfig(includeSensitive = false) {
        if (!this.config) {
            this.loadConfig();
        }

        const exportedConfig = JSON.parse(JSON.stringify(this.config));

        if (!includeSensitive) {
            // 移除敏感信息
            this.removeSensitiveData(exportedConfig);
        }

        return exportedConfig;
    }

    /**
     * 移除配置中的敏感数据
     * @param {Object} config - 配置对象
     */
    removeSensitiveData(config) {
        // 移除数据库URL中的密码
        if (config.shared && config.shared.database && config.shared.database.url) {
            config.shared.database.url = config.shared.database.url.replace(/:([^:@]+)@/, ':***@');
        }

        // 移除通知令牌
        if (config.shared && config.shared.notification && config.shared.notification.dingtalk) {
            config.shared.notification.dingtalk.accessToken = '***';
        }

        // 移除模块敏感信息
        for (const [moduleName, moduleConfig] of Object.entries(config.modules)) {
            if (moduleName === 'twitter' && moduleConfig.apiCredentials) {
                moduleConfig.apiCredentials.forEach(cred => {
                    cred.xClientSecret = '***';
                    if (cred.socksProxyUrl) {
                        cred.socksProxyUrl = cred.socksProxyUrl.replace(/:([^:@]+)@/, ':***@');
                    }
                });
            }

            if (moduleName === 'binance') {
                if (moduleConfig.apiKey) moduleConfig.apiKey = '***';
                if (moduleConfig.apiSecret) moduleConfig.apiSecret = '***';
            }
        }
    }

    /**
     * 验证模块配置
     * @param {string} moduleName - 模块名称
     * @param {Object} moduleConfig - 模块配置
     */
    validateModuleConfig(moduleName, moduleConfig) {
        switch (moduleName) {
            case 'twitter':
                if (!moduleConfig.apiCredentials || moduleConfig.apiCredentials.length === 0) {
                    throw new Error('Twitter模块缺少API凭证配置');
                }
                break;
            case 'binance':
                if (!moduleConfig.apiKey || !moduleConfig.apiSecret) {
                    console.warn('币安模块缺少API密钥，将使用公开API');
                }
                break;
        }
    }

    /**
     * 获取模块配置
     * @param {string} moduleName - 模块名称
     * @returns {Object|null} 模块配置
     */
    getModuleConfig(moduleName) {
        if (!this.config) {
            this.loadConfig();
        }
        return this.config.modules[moduleName] || null;
    }

    /**
     * 获取共享配置
     * @returns {Object} 共享配置
     */
    getSharedConfig() {
        if (!this.config) {
            this.loadConfig();
        }
        return this.config.shared;
    }

    /**
     * 检查模块是否启用
     * @param {string} moduleName - 模块名称
     * @returns {boolean} 是否启用
     */
    isModuleEnabled(moduleName) {
        const moduleConfig = this.getModuleConfig(moduleName);
        return moduleConfig && moduleConfig.enabled === true;
    }

    /**
     * 将UTC+8时间转换为UTC时间
     * @param {string} timeStr - UTC+8时间字符串 (HH:MM格式)
     * @returns {string} UTC时间字符串 (HH:MM格式)
     */
    convertUTC8ToUTC(timeStr) {
        if (!timeStr || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
            return timeStr;
        }

        const [hours, minutes] = timeStr.split(':').map(Number);
        let utcHours = hours - 8;

        if (utcHours < 0) {
            utcHours += 24;
        }

        return `${utcHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * 将嵌套结构转换为内部格式（Twitter专用）
     * @param {Array} nestedConfig - 嵌套配置数组
     * @returns {Array} 内部格式的凭证数组
     */
    convertNestedToInternalFormat(nestedConfig) {
        const internalCredentials = [];

        nestedConfig.forEach(userConfig => {
            const monitorUser = userConfig.monitorUser;

            userConfig.credentials.forEach(credential => {
                internalCredentials.push({
                    monitorUser: monitorUser,
                    xClientId: credential.clientId,
                    xClientSecret: credential.clientSecret,
                    xRedirectUri: credential.redirectUri,
                    xUserName: credential.username,
                    bitbrowserId: credential.browserId,
                    socksProxyUrl: credential.proxyUrl
                });
            });
        });

        return internalCredentials;
    }
}

// 创建统一配置管理器实例
export const unifiedConfigManager = new UnifiedConfigManager();

// 为了向后兼容，导出原有的configManager
export const configManager = unifiedConfigManager;