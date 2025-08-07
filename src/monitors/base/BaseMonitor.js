/**
 * 基础监控类
 * 提供所有监控模块的通用功能和接口规范
 */
import { getLogger } from '../../core/logger.js';

export class BaseMonitor {
    constructor(moduleName, sharedServices, config) {
        this.moduleName = moduleName;
        this.sharedServices = sharedServices;
        this.config = config;
        this.logger = getLogger(moduleName);
        this.status = 'stopped';
        this.statistics = {
            startTime: null,
            lastActivity: null,
            totalProcessed: 0,
            successCount: 0,
            errorCount: 0,
            uptime: 0
        };
        this.isInitialized = false;
        this.healthCheckInterval = null;
    }

    /**
     * 初始化监控模块
     * @returns {Promise<boolean>} 是否初始化成功
     */
    async initialize() {
        try {
            this.logger.info(`初始化监控模块: ${this.moduleName}`);
            
            // 验证配置
            if (!this.validateConfig()) {
                throw new Error('配置验证失败');
            }

            // 注册模块到数据库
            await this.registerModule();

            // 执行子类特定的初始化
            await this.onInitialize();

            this.isInitialized = true;
            this.logger.info(`监控模块 ${this.moduleName} 初始化成功`);
            return true;

        } catch (error) {
            this.logger.error(`监控模块 ${this.moduleName} 初始化失败`, { error: error.message });
            return false;
        }
    }

    /**
     * 启动监控
     * @returns {Promise<boolean>} 是否启动成功
     */
    async start() {
        try {
            if (!this.isInitialized) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('初始化失败');
                }
            }

            if (this.status === 'running') {
                this.logger.warn(`监控模块 ${this.moduleName} 已在运行中`);
                return true;
            }

            this.logger.info(`启动监控模块: ${this.moduleName}`);
            
            // 更新状态
            this.status = 'running';
            this.statistics.startTime = new Date();
            this.statistics.lastActivity = new Date();

            // 更新数据库状态
            await this.updateModuleStatus('running');

            // 启动健康检查
            this.startHealthCheck();

            // 执行子类特定的启动逻辑
            await this.onStart();

            this.logger.info(`监控模块 ${this.moduleName} 启动成功`);
            return true;

        } catch (error) {
            this.logger.error(`监控模块 ${this.moduleName} 启动失败`, { error: error.message });
            this.status = 'error';
            await this.updateModuleStatus('error');
            return false;
        }
    }

    /**
     * 停止监控
     * @returns {Promise<boolean>} 是否停止成功
     */
    async stop() {
        try {
            if (this.status === 'stopped') {
                this.logger.warn(`监控模块 ${this.moduleName} 已停止`);
                return true;
            }

            this.logger.info(`停止监控模块: ${this.moduleName}`);

            // 停止健康检查
            this.stopHealthCheck();

            // 执行子类特定的停止逻辑
            await this.onStop();

            // 更新状态
            this.status = 'stopped';
            await this.updateModuleStatus('stopped');

            this.logger.info(`监控模块 ${this.moduleName} 已停止`);
            return true;

        } catch (error) {
            this.logger.error(`监控模块 ${this.moduleName} 停止失败`, { error: error.message });
            return false;
        }
    }

    /**
     * 重启监控
     * @returns {Promise<boolean>} 是否重启成功
     */
    async restart() {
        this.logger.info(`重启监控模块: ${this.moduleName}`);
        
        const stopped = await this.stop();
        if (!stopped) {
            return false;
        }

        // 等待一段时间确保完全停止
        await this.sleep(1000);

        return await this.start();
    }

    /**
     * 获取监控状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        const now = new Date();
        const uptime = this.statistics.startTime ? 
            now.getTime() - this.statistics.startTime.getTime() : 0;

        return {
            moduleName: this.moduleName,
            status: this.status,
            isHealthy: this.isHealthy(),
            isInitialized: this.isInitialized,
            uptime: uptime,
            uptimeFormatted: this.formatDuration(uptime),
            statistics: {
                ...this.statistics,
                uptime: uptime
            },
            lastHealthCheck: this.lastHealthCheck,
            config: this.getSafeConfig()
        };
    }

    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    getStatistics() {
        const now = new Date();
        const uptime = this.statistics.startTime ? 
            now.getTime() - this.statistics.startTime.getTime() : 0;

        return {
            ...this.statistics,
            uptime: uptime,
            successRate: this.statistics.totalProcessed > 0 ? 
                (this.statistics.successCount / this.statistics.totalProcessed * 100).toFixed(2) + '%' : '0%',
            errorRate: this.statistics.totalProcessed > 0 ? 
                (this.statistics.errorCount / this.statistics.totalProcessed * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * 检查健康状态
     * @returns {boolean} 是否健康
     */
    isHealthy() {
        if (this.status !== 'running') {
            return false;
        }

        // 检查最后活动时间
        const now = new Date();
        const lastActivity = this.statistics.lastActivity;
        if (lastActivity) {
            const timeSinceLastActivity = now.getTime() - lastActivity.getTime();
            // 如果超过5分钟没有活动，认为不健康
            if (timeSinceLastActivity > 5 * 60 * 1000) {
                return false;
            }
        }

        return true;
    }

    /**
     * 更新统计信息
     * @param {string} type - 更新类型 (processed, success, error)
     * @param {number} count - 计数
     */
    updateStatistics(type, count = 1) {
        this.statistics.lastActivity = new Date();

        switch (type) {
            case 'processed':
                this.statistics.totalProcessed += count;
                break;
            case 'success':
                this.statistics.successCount += count;
                this.statistics.totalProcessed += count;
                break;
            case 'error':
                this.statistics.errorCount += count;
                this.statistics.totalProcessed += count;
                break;
        }

        // 记录指标到数据库
        this.recordMetric(type, count);
    }

    /**
     * 记录指标到数据库
     * @param {string} metricName - 指标名称
     * @param {number} metricValue - 指标值
     */
    async recordMetric(metricName, metricValue) {
        try {
            const database = this.getDatabase();
            if (database) {
                await database.recordMetric(this.moduleName, metricName, metricValue);
            }
        } catch (error) {
            this.logger.debug('记录指标失败', { error: error.message });
        }
    }

    /**
     * 启动健康检查
     */
    startHealthCheck() {
        if (this.healthCheckInterval) {
            return;
        }

        this.healthCheckInterval = setInterval(async () => {
            try {
                this.lastHealthCheck = new Date();
                const healthy = await this.performHealthCheck();
                
                if (!healthy && this.status === 'running') {
                    this.logger.warn(`监控模块 ${this.moduleName} 健康检查失败`);
                    // 可以在这里实现自动恢复逻辑
                }
            } catch (error) {
                this.logger.error('健康检查执行失败', { error: error.message });
            }
        }, 60000); // 每分钟检查一次
    }

    /**
     * 停止健康检查
     */
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * 执行健康检查
     * @returns {Promise<boolean>} 是否健康
     */
    async performHealthCheck() {
        // 基础健康检查
        if (this.status !== 'running') {
            return false;
        }

        // 子类可以重写此方法实现特定的健康检查
        return await this.onHealthCheck();
    }

    // ==================== 共享服务访问方法 ====================

    /**
     * 获取数据库管理器
     * @returns {Object} 数据库管理器
     */
    getDatabase() {
        return this.sharedServices.database;
    }

    /**
     * 获取通知管理器
     * @returns {Object} 通知管理器
     */
    getNotifier() {
        return this.sharedServices.notifier;
    }

    /**
     * 获取配置管理器
     * @returns {Object} 配置管理器
     */
    getConfig() {
        return this.sharedServices.config;
    }

    /**
     * 获取日志管理器
     * @returns {Object} 日志管理器
     */
    getLogger() {
        return this.logger;
    }

    // ==================== 私有方法 ====================

    /**
     * 验证配置
     * @returns {boolean} 配置是否有效
     */
    validateConfig() {
        if (!this.config || typeof this.config !== 'object') {
            this.logger.error('配置对象无效');
            return false;
        }

        if (!this.config.enabled) {
            this.logger.warn('监控模块未启用');
            return false;
        }

        return this.onValidateConfig();
    }

    /**
     * 注册模块到数据库
     */
    async registerModule() {
        try {
            const database = this.getDatabase();
            if (database) {
                await database.registerModule(
                    this.moduleName, 
                    this.config.type || 'unknown', 
                    this.getSafeConfig()
                );
            }
        } catch (error) {
            this.logger.error('注册模块失败', { error: error.message });
        }
    }

    /**
     * 更新模块状态到数据库
     * @param {string} status - 状态
     */
    async updateModuleStatus(status) {
        try {
            const database = this.getDatabase();
            if (database) {
                await database.updateModuleStatus(this.moduleName, status);
            }
        } catch (error) {
            this.logger.error('更新模块状态失败', { error: error.message });
        }
    }

    /**
     * 获取安全的配置（移除敏感信息）
     * @returns {Object} 安全配置
     */
    getSafeConfig() {
        const safeConfig = { ...this.config };
        
        // 移除敏感字段
        const sensitiveFields = ['apiKey', 'apiSecret', 'accessToken', 'password', 'token'];
        sensitiveFields.forEach(field => {
            if (safeConfig[field]) {
                safeConfig[field] = '***';
            }
        });

        return safeConfig;
    }

    /**
     * 格式化持续时间
     * @param {number} ms - 毫秒数
     * @returns {string} 格式化后的时间
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}天 ${hours % 24}小时 ${minutes % 60}分钟`;
        } else if (hours > 0) {
            return `${hours}小时 ${minutes % 60}分钟`;
        } else if (minutes > 0) {
            return `${minutes}分钟 ${seconds % 60}秒`;
        } else {
            return `${seconds}秒`;
        }
    }

    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== 子类需要实现的方法 ====================

    /**
     * 子类初始化方法
     * @returns {Promise<void>}
     */
    async onInitialize() {
        // 子类实现
    }

    /**
     * 子类启动方法
     * @returns {Promise<void>}
     */
    async onStart() {
        // 子类实现
    }

    /**
     * 子类停止方法
     * @returns {Promise<void>}
     */
    async onStop() {
        // 子类实现
    }

    /**
     * 子类配置验证方法
     * @returns {boolean} 配置是否有效
     */
    onValidateConfig() {
        return true; // 子类实现
    }

    /**
     * 子类健康检查方法
     * @returns {Promise<boolean>} 是否健康
     */
    async onHealthCheck() {
        return true; // 子类实现
    }
}