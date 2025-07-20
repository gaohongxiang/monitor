/**
 * 配置管理器
 * 完全基于环境变量的配置管理，不再依赖config.json
 */
export class ConfigManager {
    constructor() {
        this.config = null;
        this.apiCredentials = null;
    }

    /**
     * 加载配置（从环境变量）
     * @returns {Object} 配置对象
     */
    loadConfig() {
        try {
            // 解析API凭证配置
            this.apiCredentials = this.parseApiCredentials();

            // 构建配置对象
            this.config = {
                monitoredUsers: this.buildMonitoredUsers(),
                dingtalkAccessToken: process.env.DINGTALK_ACCESS_TOKEN,
                monitorSettings: this.getMonitorSettings()
            };

            console.log('✅ 环境变量配置加载成功');
            this.validateConfig();
            return this.config;
        } catch (error) {
            console.error('❌ 加载环境变量配置失败:', error.message);
            throw error;
        }
    }

    /**
     * 解析API凭证配置
     * @returns {Array} API凭证列表
     */
    parseApiCredentials() {
        const apiCredentialsJson = process.env.API_CREDENTIALS;
        if (!apiCredentialsJson) {
            throw new Error('API_CREDENTIALS环境变量未设置');
        }

        try {
            const credentials = JSON.parse(apiCredentialsJson);
            if (!Array.isArray(credentials)) {
                throw new Error('API_CREDENTIALS必须是数组格式');
            }

            // 验证每个凭证的必需字段
            for (const cred of credentials) {
                const requiredFields = ['id', 'monitorUser', 'clientId', 'clientSecret', 'redirectUri', 'username', 'browserId', 'proxyUrl'];
                for (const field of requiredFields) {
                    if (!cred[field]) {
                        throw new Error(`API凭证缺少必需字段: ${field}`);
                    }
                }
            }

            return credentials;
        } catch (error) {
            throw new Error(`解析API_CREDENTIALS失败: ${error.message}`);
        }
    }

    /**
     * 构建监控用户配置
     * @returns {Array} 监控用户列表
     */
    buildMonitoredUsers() {
        const userMap = new Map();

        // 按monitorUser分组API凭证
        for (const cred of this.apiCredentials) {
            const monitorUser = cred.monitorUser;
            if (!userMap.has(monitorUser)) {
                userMap.set(monitorUser, {
                    xMonitorNickName: monitorUser,
                    description: `监控用户: ${monitorUser}`,
                    apiCredentials: []
                });
            }

            userMap.get(monitorUser).apiCredentials.push({
                id: cred.id,
                xClientId: cred.clientId,
                xClientSecret: cred.clientSecret,
                xRedirectUri: cred.redirectUri,
                xUserName: cred.username,
                bitbrowserId: cred.browserId,
                socksProxyUrl: cred.proxyUrl
            });
        }

        return Array.from(userMap.values());
    }

    /**
     * 将UTC+8时间转换为UTC时间
     * @param {string} timeStr - UTC+8时间字符串 (HH:MM格式)
     * @returns {string} UTC时间字符串 (HH:MM格式)
     */
    convertUTC8ToUTC(timeStr) {
        if (!timeStr || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
            return timeStr; // 格式不正确，返回原值
        }

        const [hours, minutes] = timeStr.split(':').map(Number);
        
        // UTC+8转UTC需要减去8小时
        let utcHours = hours - 8;
        
        // 处理跨日情况
        if (utcHours < 0) {
            utcHours += 24;
        }
        
        return `${utcHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * 获取监控设置
     * @returns {Object} 监控设置对象
     */
    getMonitorSettings() {
        const startTimeUTC8 = process.env.MONITOR_START_TIME || "09:00";
        const endTimeUTC8 = process.env.MONITOR_END_TIME || "23:00";
        
        return {
            // 用户输入的UTC+8时间
            startTimeUTC8: startTimeUTC8,
            endTimeUTC8: endTimeUTC8,
            // 转换后的UTC时间（供内部使用）
            startTime: this.convertUTC8ToUTC(startTimeUTC8),
            endTime: this.convertUTC8ToUTC(endTimeUTC8),
            testMode: process.env.TEST_MODE === 'true',
            testIntervalMinutes: parseInt(process.env.TEST_INTERVAL || "1")
        };
    }

    /**
     * 验证配置完整性
     */
    validateConfig() {
        const requiredEnvVars = [
            'API_CREDENTIALS',
            'DINGTALK_ACCESS_TOKEN',
            'DATABASE_URL'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`缺少必需的环境变量: ${missingVars.join(', ')}`);
        }

        if (!this.config.monitoredUsers || this.config.monitoredUsers.length === 0) {
            throw new Error('没有配置任何监控用户');
        }

        console.log(`✅ 配置验证通过，监控用户数: ${this.config.monitoredUsers.length}`);
    }

    /**
     * 获取所有监控用户
     * @returns {Array} 监控用户列表
     */
    getMonitoredUsers() {
        if (!this.config) {
            this.loadConfig();
        }
        return this.config.monitoredUsers || [];
    }

    /**
     * 获取所有监控用户的昵称列表
     * @returns {Array<string>} 用户昵称列表
     */
    getMonitoredUserNicknames() {
        if (!this.config) {
            this.loadConfig();
        }

        return this.config.monitoredUsers?.map(user => user.xMonitorNickName) || [];
    }

    /**
     * 根据昵称获取用户配置
     * @param {string} nickname - 用户昵称
     * @returns {Object|null} 用户配置对象
     */
    getUserByNickname(nickname) {
        if (!this.config) {
            this.loadConfig();
        }

        return this.config.monitoredUsers?.find(user => user.xMonitorNickName === nickname) || null;
    }

    /**
     * 获取用户的所有API凭证
     * @param {string} nickname - 用户昵称
     * @returns {Array} API凭证列表
     */
    getUserApiCredentials(nickname) {
        const user = this.getUserByNickname(nickname);
        return user ? user.apiCredentials : [];
    }

    /**
     * 获取用户的可用API凭证
     * @param {string} nickname - 用户昵称
     * @returns {Object|null} API凭证对象
     */
    getAvailableApiCredential(nickname) {
        const user = this.getUserByNickname(nickname);
        if (!user || !user.apiCredentials || user.apiCredentials.length === 0) {
            return null;
        }

        // 简单返回第一个凭证，后续可以添加更复杂的选择逻辑
        return user.apiCredentials[0];
    }

    /**
     * 获取下一个API凭证（用于轮换）
     * @param {string} nickname - 用户昵称
     * @param {string} currentCredentialId - 当前凭证ID
     * @returns {Object|null} 下一个API凭证对象
     */
    getNextApiCredential(nickname, currentCredentialId) {
        const user = this.getUserByNickname(nickname);
        if (!user || !user.apiCredentials || user.apiCredentials.length === 0) {
            return null;
        }

        const credentials = user.apiCredentials;
        const currentIndex = credentials.findIndex(cred => cred.id === currentCredentialId);

        if (currentIndex === -1) {
            // 如果找不到当前凭证，返回第一个
            return credentials[0];
        }

        // 返回下一个凭证，如果是最后一个则返回第一个
        const nextIndex = (currentIndex + 1) % credentials.length;
        return credentials[nextIndex];
    }

    /**
     * 检查用户监控是否启用
     * @param {string} nickname - 用户昵称
     * @returns {boolean} 是否启用监控
     */
    isUserMonitorEnabled(nickname) {
        const user = this.getUserByNickname(nickname);
        return user && (user.monitorSettings?.enabled !== false);
    }

    /**
     * 获取钉钉访问令牌
     * @returns {string|null} 钉钉访问令牌
     */
    getDingtalkAccessToken() {
        if (!this.config) {
            this.loadConfig();
        }

        return this.config.dingtalkAccessToken || null;
    }



    /**
     * 验证环境变量格式
     * @returns {Object} 验证结果
     */
    validateEnvironmentVariables() {
        const validationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // 检查必需的环境变量
        const requiredEnvVars = {
            'API_CREDENTIALS': 'API凭证配置（JSON格式）',
            'DINGTALK_ACCESS_TOKEN': '钉钉访问令牌',
            'DATABASE_URL': '数据库连接URL'
        };

        for (const [varName, description] of Object.entries(requiredEnvVars)) {
            if (!process.env[varName]) {
                validationResult.isValid = false;
                validationResult.errors.push(`缺少必需的环境变量: ${varName} (${description})`);
            }
        }

        // 检查可选的环境变量格式
        const optionalEnvVars = {
            'NODE_ENV': {
                description: '运行环境',
                validValues: ['development', 'production', 'test'],
                defaultValue: 'development'
            },
            'TEST_MODE': {
                description: '测试模式',
                validValues: ['true', 'false'],
                defaultValue: 'false'
            },
            'TEST_INTERVAL': {
                description: '测试间隔（分钟）',
                validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
                defaultValue: '1'
            },
            'MONITOR_START_TIME': {
                description: '监控开始时间',
                validator: (value) => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value),
                defaultValue: '09:00'
            },
            'MONITOR_END_TIME': {
                description: '监控结束时间',
                validator: (value) => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value),
                defaultValue: '23:00'
            }
        };

        for (const [varName, config] of Object.entries(optionalEnvVars)) {
            const value = process.env[varName];
            if (value) {
                if (config.validValues && !config.validValues.includes(value)) {
                    validationResult.warnings.push(
                        `环境变量 ${varName} 值 "${value}" 不在有效值范围内: ${config.validValues.join(', ')}`
                    );
                } else if (config.validator && !config.validator(value)) {
                    validationResult.warnings.push(
                        `环境变量 ${varName} 格式无效: "${value}" (${config.description})`
                    );
                }
            } else {
                validationResult.warnings.push(
                    `环境变量 ${varName} 未设置，将使用默认值: ${config.defaultValue} (${config.description})`
                );
            }
        }

        return validationResult;
    }

    /**
     * 验证API凭证配置的详细格式
     * @param {Array} credentials - API凭证列表
     * @returns {Object} 验证结果
     */
    validateApiCredentials(credentials) {
        const validationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        if (!Array.isArray(credentials)) {
            validationResult.isValid = false;
            validationResult.errors.push('API_CREDENTIALS必须是数组格式');
            return validationResult;
        }

        if (credentials.length === 0) {
            validationResult.isValid = false;
            validationResult.errors.push('API_CREDENTIALS不能为空数组');
            return validationResult;
        }

        const requiredFields = [
            { name: 'id', description: '凭证唯一标识符' },
            { name: 'monitorUser', description: '要监控的Twitter用户名' },
            { name: 'clientId', description: 'Twitter API客户端ID' },
            { name: 'clientSecret', description: 'Twitter API客户端密钥' },
            { name: 'redirectUri', description: 'OAuth重定向URI' },
            { name: 'username', description: 'X平台用户名' },
            { name: 'browserId', description: '指纹浏览器ID' },
            { name: 'proxyUrl', description: '代理服务器地址' }
        ];

        const credentialIds = new Set();
        const monitorUsers = new Set();

        credentials.forEach((cred, index) => {
            // 检查必需字段
            for (const field of requiredFields) {
                if (!cred[field.name] || typeof cred[field.name] !== 'string' || cred[field.name].trim() === '') {
                    validationResult.isValid = false;
                    validationResult.errors.push(
                        `API凭证[${index}]缺少或格式错误的字段: ${field.name} (${field.description})`
                    );
                }
            }

            // 检查ID唯一性
            if (cred.id) {
                if (credentialIds.has(cred.id)) {
                    validationResult.isValid = false;
                    validationResult.errors.push(`API凭证ID重复: ${cred.id}`);
                } else {
                    credentialIds.add(cred.id);
                }
            }

            // 统计监控用户
            if (cred.monitorUser) {
                monitorUsers.add(cred.monitorUser);
            }

            // 验证URL格式
            if (cred.redirectUri && !this.isValidUrl(cred.redirectUri)) {
                validationResult.warnings.push(
                    `API凭证[${index}]的redirectUri格式可能无效: ${cred.redirectUri}`
                );
            }

            if (cred.proxyUrl && !this.isValidUrl(cred.proxyUrl)) {
                validationResult.warnings.push(
                    `API凭证[${index}]的proxyUrl格式可能无效: ${cred.proxyUrl}`
                );
            }
        });

        // 统计信息
        validationResult.summary = {
            totalCredentials: credentials.length,
            uniqueMonitorUsers: monitorUsers.size,
            monitorUsers: Array.from(monitorUsers)
        };

        return validationResult;
    }

    /**
     * 验证URL格式
     * @param {string} url - 要验证的URL
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
     * 获取配置摘要信息
     * @returns {Object} 配置摘要
     */
    getConfigSummary() {
        if (!this.config) {
            this.loadConfig();
        }

        return {
            environment: process.env.NODE_ENV || 'development',
            testMode: this.config.monitorSettings.testMode,
            monitoredUsers: this.config.monitoredUsers.length,
            totalApiCredentials: this.config.monitoredUsers.reduce(
                (total, user) => total + user.apiCredentials.length, 0
            ),
            monitorSettings: {
                startTime: this.config.monitorSettings.startTime,
                endTime: this.config.monitorSettings.endTime,
                testIntervalMinutes: this.config.monitorSettings.testIntervalMinutes
            },
            hasDingtalkToken: !!this.config.dingtalkAccessToken,
            hasDatabaseUrl: !!process.env.DATABASE_URL
        };
    }

    /**
     * 打印配置验证报告
     */
    printValidationReport() {
        console.log('\n📋 配置验证报告');
        console.log('='.repeat(50));

        // 环境变量验证
        const envValidation = this.validateEnvironmentVariables();
        console.log('\n🔧 环境变量检查:');

        if (envValidation.errors.length > 0) {
            console.log('❌ 错误:');
            envValidation.errors.forEach(error => console.log(`   - ${error}`));
        }

        if (envValidation.warnings.length > 0) {
            console.log('⚠️  警告:');
            envValidation.warnings.forEach(warning => console.log(`   - ${warning}`));
        }

        if (envValidation.errors.length === 0) {
            console.log('✅ 所有必需的环境变量都已设置');
        }

        // API凭证验证
        if (this.apiCredentials) {
            const credValidation = this.validateApiCredentials(this.apiCredentials);
            console.log('\n🔑 API凭证检查:');

            if (credValidation.errors.length > 0) {
                console.log('❌ 错误:');
                credValidation.errors.forEach(error => console.log(`   - ${error}`));
            }

            if (credValidation.warnings.length > 0) {
                console.log('⚠️  警告:');
                credValidation.warnings.forEach(warning => console.log(`   - ${warning}`));
            }

            if (credValidation.summary) {
                console.log('📊 统计信息:');
                console.log(`   - 总凭证数: ${credValidation.summary.totalCredentials}`);
                console.log(`   - 监控用户数: ${credValidation.summary.uniqueMonitorUsers}`);
                console.log(`   - 监控用户: ${credValidation.summary.monitorUsers.join(', ')}`);
            }
        }

        // 配置摘要
        const summary = this.getConfigSummary();
        console.log('\n📈 配置摘要:');
        console.log(`   - 运行环境: ${summary.environment}`);
        console.log(`   - 测试模式: ${summary.testMode ? '启用' : '禁用'}`);
        console.log(`   - 监控时间: ${summary.monitorSettings.startTime} - ${summary.monitorSettings.endTime}`);
        console.log(`   - 钉钉通知: ${summary.hasDingtalkToken ? '已配置' : '未配置'}`);
        console.log(`   - 数据库: ${summary.hasDatabaseUrl ? '已配置' : '未配置'}`);

        console.log('\n' + '='.repeat(50));

        return envValidation.isValid && (this.apiCredentials ? this.validateApiCredentials(this.apiCredentials).isValid : false);
    }

    /**
     * 更新API凭证的限额状态（保留兼容性，但不再使用）
     * @param {string} nickname - 用户昵称
     * @param {string} credentialId - 凭证ID
     * @param {Object} rateLimitStatus - 限额状态
     */
    updateRateLimitStatus(nickname, credentialId, rateLimitStatus) {
        console.warn('updateRateLimitStatus方法已废弃，限额状态现在通过数据库管理');
    }

    /**
     * 生成环境变量配置模板
     * @returns {string} 环境变量配置模板
     */
    generateEnvTemplate() {
        return `# Twitter多用户监控系统 - 环境变量配置模板
# 复制此文件为 .env 并填入实际值

# ===== 必需配置 =====

# 钉钉机器人访问令牌
DINGTALK_ACCESS_TOKEN=your_dingtalk_access_token_here

# PostgreSQL数据库连接URL
# 格式: postgresql://用户名:密码@主机:端口/数据库名
DATABASE_URL=postgresql://username:password@localhost:5432/twitter_monitor

# API凭证配置（JSON格式）
# 注意：这是一个JSON数组，包含所有API凭证
API_CREDENTIALS='[
  {
    "id": "cred_1",
    "monitorUser": "要监控的Twitter用户名",
    "clientId": "Twitter_API_客户端ID",
    "clientSecret": "Twitter_API_客户端密钥",
    "redirectUri": "OAuth重定向URI",
    "username": "X平台用户名",
    "browserId": "指纹浏览器ID",
    "proxyUrl": "代理服务器地址"
  }
]'

# ===== 可选配置 =====

# 运行环境 (development/production/test)
NODE_ENV=development

# 测试模式 (true/false)
TEST_MODE=false

# 测试间隔（分钟）
TEST_INTERVAL=1

# 监控开始时间 (HH:MM格式)
MONITOR_START_TIME=09:00

# 监控结束时间 (HH:MM格式)
MONITOR_END_TIME=23:00

# ===== Railway部署专用 =====
# 如果部署到Railway，还需要设置以下变量：
# PORT=3000
# TZ=Asia/Shanghai
`;
    }

    /**
     * 初始化配置（首次运行时调用）
     * @param {boolean} createEnvFile - 是否创建.env文件
     * @returns {boolean} 是否成功初始化
     */
    async initializeConfig(createEnvFile = false) {
        try {
            console.log('🔧 初始化配置管理器...');

            // 检查是否已有配置
            const envValidation = this.validateEnvironmentVariables();

            if (envValidation.isValid) {
                console.log('✅ 配置已存在且有效');
                return true;
            }

            // 如果需要创建.env文件
            if (createEnvFile) {
                const fs = await import('fs');
                const envTemplate = this.generateEnvTemplate();

                if (!fs.existsSync('.env')) {
                    fs.writeFileSync('.env', envTemplate);
                    console.log('📄 已创建 .env 配置文件模板');
                    console.log('请编辑 .env 文件并填入实际配置值');
                } else {
                    console.log('⚠️  .env 文件已存在，跳过创建');
                }
            }

            // 显示配置错误
            if (envValidation.errors.length > 0) {
                console.log('\n❌ 配置错误:');
                envValidation.errors.forEach(error => console.log(`   - ${error}`));
            }

            if (envValidation.warnings.length > 0) {
                console.log('\n⚠️  配置警告:');
                envValidation.warnings.forEach(warning => console.log(`   - ${warning}`));
            }

            console.log('\n💡 配置帮助:');
            console.log('   1. 确保所有必需的环境变量都已设置');
            console.log('   2. 检查API_CREDENTIALS的JSON格式是否正确');
            console.log('   3. 验证数据库连接URL格式');
            console.log('   4. 运行 node test_config.js 测试配置');

            return false;

        } catch (error) {
            console.error('❌ 初始化配置失败:', error.message);
            return false;
        }
    }

    /**
     * 获取环境信息
     * @returns {Object} 环境信息
     */
    getEnvironmentInfo() {
        const nodeEnv = process.env.NODE_ENV || 'development';

        // 使用UTC时间
        process.env.TZ = 'UTC';

        return {
            nodeEnv,
            isProduction: nodeEnv === 'production',
            isDevelopment: nodeEnv === 'development',
            isTest: nodeEnv === 'test',
            testMode: process.env.TEST_MODE === 'true',
            timezone: 'UTC', // 使用UTC时间
            port: process.env.PORT || '3000',

            // 环境特定配置
            databaseUrl: this.getDatabaseUrl(),
            logLevel: this.getLogLevel(),
            enableDebug: this.isDebugEnabled(),

            // 部署信息
            deploymentPlatform: this.getDeploymentPlatform(),
            buildVersion: process.env.BUILD_VERSION || 'unknown',
            buildTime: process.env.BUILD_TIME || 'unknown'
        };
    }

    /**
     * 获取环境特定的数据库URL
     * @returns {string} 数据库连接URL
     */
    getDatabaseUrl() {
        const nodeEnv = process.env.NODE_ENV || 'development';

        // 优先使用环境特定的数据库URL
        const envSpecificUrl = process.env[`DATABASE_URL_${nodeEnv.toUpperCase()}`];
        if (envSpecificUrl) {
            return envSpecificUrl;
        }

        // 回退到通用数据库URL
        return process.env.DATABASE_URL || '';
    }

    /**
     * 获取日志级别
     * @returns {string} 日志级别
     */
    getLogLevel() {
        const nodeEnv = process.env.NODE_ENV || 'development';

        // 环境特定的日志级别
        const envLogLevel = process.env.LOG_LEVEL;
        if (envLogLevel) {
            return envLogLevel;
        }

        // 根据环境设置默认日志级别
        switch (nodeEnv) {
            case 'production':
                return 'warn';
            case 'test':
                return 'error';
            case 'development':
            default:
                return 'debug';
        }
    }

    /**
     * 检查是否启用调试模式
     * @returns {boolean} 是否启用调试
     */
    isDebugEnabled() {
        const nodeEnv = process.env.NODE_ENV || 'development';

        // 显式设置的调试模式
        if (process.env.DEBUG !== undefined) {
            return process.env.DEBUG === 'true';
        }

        // 根据环境自动判断
        return nodeEnv === 'development';
    }

    /**
     * 获取部署平台信息
     * @returns {string} 部署平台
     */
    getDeploymentPlatform() {
        // Railway平台检测
        if (process.env.RAILWAY_ENVIRONMENT) {
            return 'railway';
        }

        // Heroku平台检测
        if (process.env.DYNO) {
            return 'heroku';
        }

        // Vercel平台检测
        if (process.env.VERCEL) {
            return 'vercel';
        }

        // Docker容器检测
        if (process.env.DOCKER_CONTAINER || process.env.HOSTNAME?.startsWith('docker')) {
            return 'docker';
        }

        // 本地开发环境
        return 'local';
    }



    /**
     * 检查环境配置的有效性
     * @returns {Object} 环境配置验证结果
     */
    validateEnvironmentConfiguration() {
        const envInfo = this.getEnvironmentInfo();
        const validation = {
            isValid: true,
            errors: [],
            warnings: [],
            environment: envInfo.nodeEnv
        };

        // 验证数据库URL
        if (!envInfo.databaseUrl) {
            validation.isValid = false;
            validation.errors.push(`${envInfo.nodeEnv}环境缺少数据库配置`);
        }

        // 生产环境特定验证
        if (envInfo.isProduction) {
            if (envInfo.testMode) {
                validation.warnings.push('生产环境启用了测试模式');
            }

            if (envInfo.enableDebug) {
                validation.warnings.push('生产环境启用了调试模式');
            }

            if (!process.env.BUILD_VERSION) {
                validation.warnings.push('生产环境缺少构建版本信息');
            }
        }

        // 开发环境特定验证
        if (envInfo.isDevelopment) {
            if (!envInfo.enableDebug) {
                validation.warnings.push('开发环境建议启用调试模式');
            }
        }

        // 测试环境特定验证
        if (envInfo.isTest) {
            if (!envInfo.testMode) {
                validation.warnings.push('测试环境建议启用测试模式');
            }
        }

        return validation;
    }

    /**
     * 打印环境信息报告
     */
    printEnvironmentReport() {
        const envInfo = this.getEnvironmentInfo();
        const validation = this.validateEnvironmentConfiguration();

        console.log('\n🌍 环境信息报告');
        console.log('='.repeat(50));

        console.log('\n📊 基础信息:');
        console.log(`   - 运行环境: ${envInfo.nodeEnv}`);
        console.log(`   - 部署平台: ${envInfo.deploymentPlatform}`);
        console.log(`   - 时区: ${envInfo.timezone}`);
        console.log(`   - 端口: ${envInfo.port}`);
        console.log(`   - 构建版本: ${envInfo.buildVersion}`);
        console.log(`   - 构建时间: ${envInfo.buildTime}`);

        console.log('\n⚙️  运行模式:');
        console.log(`   - 测试模式: ${envInfo.testMode ? '启用' : '禁用'}`);
        console.log(`   - 调试模式: ${envInfo.enableDebug ? '启用' : '禁用'}`);
        console.log(`   - 日志级别: ${envInfo.logLevel}`);

        console.log('\n🗄️  数据库配置:');
        console.log(`   - 数据库URL: ${envInfo.databaseUrl ? '已配置' : '未配置'}`);
        if (envInfo.databaseUrl) {
            // 隐藏敏感信息
            const maskedUrl = envInfo.databaseUrl.replace(/:\/\/[^@]+@/, '://***:***@');
            console.log(`   - 连接信息: ${maskedUrl}`);
        }

        console.log('\n📋 配置验证:');
        if (validation.errors.length > 0) {
            console.log('❌ 错误:');
            validation.errors.forEach(error => console.log(`   - ${error}`));
        }

        if (validation.warnings.length > 0) {
            console.log('⚠️  警告:');
            validation.warnings.forEach(warning => console.log(`   - ${warning}`));
        }

        if (validation.errors.length === 0) {
            console.log('✅ 环境配置验证通过');
        }

        console.log('\n' + '='.repeat(50));

        return validation.isValid;
    }

    /**
     * 检查配置是否就绪
     * @returns {boolean} 配置是否就绪
     */
    isConfigReady() {
        try {
            const envValidation = this.validateEnvironmentVariables();
            return envValidation.isValid;
        } catch {
            return false;
        }
    }

}

// 创建配置管理器实例
export const configManager = new ConfigManager();