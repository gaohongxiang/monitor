/**
 * 简化的配置管理器
 * 专注于核心功能，减少复杂性
 */
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

export class UnifiedConfigManager {
    constructor() {
        this.config = null;
    }

    /**
     * 获取启用的监控模块列表
     * @returns {Array<string>} 启用的模块名称列表
     */
    getEnabledModules() {
        const enabledModules = [];

        // 简单的环境变量检查
        if (process.env.TWITTER_ENABLED === 'true') {
            enabledModules.push('twitter');
        }

        if (process.env.BINANCE_ANNOUNCEMENT_ENABLED === 'true') {
            enabledModules.push('binance-announcement');
        }

        if (process.env.BINANCE_PRICE_ENABLED === 'true') {
            enabledModules.push('binance-price');
        }

        return enabledModules;
    }

    /**
     * 检查模块是否启用
     * @param {string} moduleName - 模块名称
     * @returns {boolean} 是否启用
     */
    isModuleEnabled(moduleName) {
        return this.getEnabledModules().includes(moduleName);
    }

    /**
     * 加载配置
     * @returns {Object} 配置对象
     */
    loadConfig() {
        if (this.config) {
            return this.config;
        }

        const enabledModules = this.getEnabledModules();
        
        this.config = {
            // 系统配置
            system: {
                enabledModules,
                environment: process.env.NODE_ENV || 'production',
                port: process.env.PORT || 3000
            },

            // 模块配置
            modules: {
                twitter: this.loadTwitterConfig(),
                'binance-announcement': this.loadBinanceAnnouncementConfig(),
                'binance-price': this.loadBinancePriceConfig()
            },

            // 共享配置
            shared: {
                database: {
                    url: process.env.DATABASE_URL
                },
                notification: {
                    dingtalk: {
                        accessToken: process.env.DINGTALK_ACCESS_TOKEN
                    }
                },
                translation: {
                    deepl: {
                        apiKey: process.env.DEEPL_API_KEY
                    }
                }
            }
        };

        console.log(`✅ 配置加载成功，启用模块: ${enabledModules.join(', ')}`);
        return this.config;
    }

    /**
     * 加载Twitter配置
     */
    loadTwitterConfig() {
        if (!process.env.API_CREDENTIALS) {
            return { enabled: false };
        }

        try {
            const nestedConfig = JSON.parse(process.env.API_CREDENTIALS);
            const apiCredentials = this.convertNestedToInternalFormat(nestedConfig);

            return {
                enabled: process.env.TWITTER_ENABLED === 'true',
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
            console.error('❌ Twitter配置解析失败:', error.message);
            return { enabled: false };
        }
    }

    /**
     * 加载Binance公告监控配置
     */
    loadBinanceAnnouncementConfig() {
        return {
            enabled: process.env.BINANCE_ANNOUNCEMENT_ENABLED === 'true',
            apiKey: process.env.BINANCE_API_KEY,
            secretKey: process.env.BINANCE_SECRET_KEY,
            proxyUrl: process.env.BINANCE_PROXY_URL,
            topics: ['com_announcement_en'],
            recvWindow: 30000,
            maxReconnectAttempts: 10,
            reconnectDelay: 5000
        };
    }

    /**
     * 加载Binance价格监控配置
     */
    loadBinancePriceConfig() {
        let symbols = [];
        let symbolThresholds = {};
        const defaultThreshold = parseFloat(process.env.BINANCE_PRICE_THRESHOLD || '5.0');

        if (process.env.BINANCE_PRICE_SYMBOLS) {
            try {
                // 支持两种格式:
                // 1. 简化格式: BTCUSDT:3,ETHUSDT:4,BNBUSDT:6
                // 2. 传统格式: BTCUSDT,ETHUSDT,BNBUSDT (使用默认阈值)
                const symbolPairs = process.env.BINANCE_PRICE_SYMBOLS.split(',');

                for (const pair of symbolPairs) {
                    const trimmed = pair.trim();
                    if (trimmed.includes(':')) {
                        // 简化格式: 交易对:阈值
                        const [symbol, threshold] = trimmed.split(':').map(s => s.trim());
                        if (symbol && threshold) {
                            symbols.push(symbol);
                            symbolThresholds[symbol] = parseFloat(threshold);
                        }
                    } else {
                        // 传统格式: 只有交易对名称
                        symbols.push(trimmed);
                    }
                }
            } catch (error) {
                console.warn('⚠️  解析BINANCE_PRICE_SYMBOLS失败:', error.message);
                symbols = ['BTCUSDT', 'ETHUSDT'];
            }
        } else {
            symbols = ['BTCUSDT', 'ETHUSDT'];
        }

        return {
            enabled: process.env.BINANCE_PRICE_ENABLED === 'true',
            symbols: symbols,
            alertThreshold: defaultThreshold,
            symbolThresholds: symbolThresholds,
            checkInterval: parseInt(process.env.BINANCE_PRICE_INTERVAL || '300'),
            cooldownPeriod: parseInt(process.env.BINANCE_PRICE_COOLDOWN || '3600'),
            dailyReportTime: process.env.BINANCE_PRICE_DAILY_TIME || '09:00'
        };
    }

    /**
     * 获取模块配置
     * @param {string} moduleName - 模块名称
     * @returns {Object} 模块配置
     */
    getModuleConfig(moduleName) {
        if (!this.config) {
            this.loadConfig();
        }
        return this.config.modules[moduleName] || { enabled: false };
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

    // 保持向后兼容的方法
    async initialize() {
        this.loadConfig();
        return true;
    }

    // 兼容旧版本的方法
    convertNestedToInternalFormat(nestedConfig) {
        const internalCredentials = [];
        nestedConfig.forEach(userConfig => {
            const monitorUser = userConfig.monitorUser;
            userConfig.credentials.forEach(credential => {
                // 支持新旧字段名格式，向后兼容
                internalCredentials.push({
                    monitorUser: monitorUser,
                    twitterClientId: credential.clientId || credential.twitterClientId,
                    twitterClientSecret: credential.clientSecret || credential.twitterClientSecret,
                    twitterRedirectUri: credential.redirectUri || credential.twitterRedirectUri,
                    twitterUserName: credential.username || credential.twitterUserName,
                    bitbrowserId: credential.browserId || credential.bitbrowserId,
                    socksProxyUrl: credential.proxyUrl || credential.socksProxyUrl
                });
            });
        });
        return internalCredentials;
    }

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
}

// 创建单例实例
export const unifiedConfigManager = new UnifiedConfigManager();
