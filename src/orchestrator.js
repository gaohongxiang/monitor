/**
 * 监控编排器
 * 统一管理所有监控模块的生命周期和资源分配
 */
import { getLogger } from './core/logger.js';

export class MonitorOrchestrator {
    constructor(sharedServices) {
        this.sharedServices = sharedServices;
        this.logger = getLogger('orchestrator');
        this.activeMonitors = new Map();
        this.moduleLoaders = new Map();
        this.moduleStates = new Map(); // 模块状态跟踪
        this.failureCounters = new Map(); // 故障计数器
        this.recoveryAttempts = new Map(); // 恢复尝试计数
        this.isRunning = false;
        this.healthCheckInterval = null;
        this.startTime = null;
        this.maxFailureCount = 3; // 最大故障次数
        this.maxRecoveryAttempts = 5; // 最大恢复尝试次数
        this.recoveryDelay = 5000; // 恢复延迟（毫秒）
        
        // 初始化模块加载器
        this.initializeModuleLoaders();
    }

    /**
     * 初始化模块加载器
     */
    initializeModuleLoaders() {
        // 注册已知的监控模块加载器
        this.moduleLoaders.set('twitter', () => this.loadTwitterModule());
        this.moduleLoaders.set('binance', () => this.loadBinanceModule());
    }

    /**
     * 启动编排器
     * @returns {Promise<boolean>} 是否启动成功
     */
    async start() {
        try {
            if (this.isRunning) {
                this.logger.warn('监控编排器已在运行中');
                return true;
            }

            this.logger.info('启动监控编排器');
            this.startTime = Date.now();

            // 初始化模块状态跟踪
            this.initializeModuleTracking();

            // 加载启用的监控模块
            const loadedCount = await this.loadEnabledMonitors();
            if (loadedCount === 0) {
                this.logger.warn('没有加载任何监控模块');
                return false;
            }

            // 启动所有监控模块
            const startedCount = await this.startAllMonitors();
            if (startedCount === 0) {
                this.logger.error('没有成功启动任何监控模块');
                return false;
            }

            // 启动健康检查
            this.startHealthCheck();

            this.isRunning = true;
            this.logger.info(`监控编排器启动成功，运行中的模块: ${startedCount}/${loadedCount}`);
            return true;

        } catch (error) {
            this.logger.error('监控编排器启动失败', { error: error.message });
            return false;
        }
    }

    /**
     * 停止编排器
     * @returns {Promise<boolean>} 是否停止成功
     */
    async stop() {
        try {
            if (!this.isRunning) {
                this.logger.warn('监控编排器未在运行');
                return true;
            }

            this.logger.info('停止监控编排器');

            // 停止健康检查
            this.stopHealthCheck();

            // 停止所有监控模块
            await this.stopAllMonitors();

            this.isRunning = false;
            this.logger.info('监控编排器已停止');
            return true;

        } catch (error) {
            this.logger.error('监控编排器停止失败', { error: error.message });
            return false;
        }
    }

    /**
     * 重启编排器
     * @returns {Promise<boolean>} 是否重启成功
     */
    async restart() {
        this.logger.info('重启监控编排器');
        
        const stopped = await this.stop();
        if (!stopped) {
            return false;
        }

        await this.sleep(2000);
        return await this.start();
    }

    /**
     * 加载启用的监控模块
     * @returns {Promise<number>} 加载的模块数量
     */
    async loadEnabledMonitors() {
        try {
            const config = this.sharedServices.config;
            const enabledModules = config.getEnabledModules();
            
            this.logger.info(`开始加载监控模块: ${enabledModules.join(', ')}`);

            let loadedCount = 0;
            for (const moduleName of enabledModules) {
                try {
                    const success = await this.loadMonitor(moduleName);
                    if (success) {
                        loadedCount++;
                        this.logger.info(`模块 ${moduleName} 加载成功`);
                    } else {
                        this.logger.error(`模块 ${moduleName} 加载失败`);
                    }
                } catch (error) {
                    this.logger.error(`加载模块 ${moduleName} 时出错`, { error: error.message });
                }
            }

            this.logger.info(`模块加载完成，成功: ${loadedCount}/${enabledModules.length}`);
            return loadedCount;

        } catch (error) {
            this.logger.error('加载监控模块失败', { error: error.message });
            return 0;
        }
    }

    /**
     * 加载单个监控模块
     * @param {string} moduleName - 模块名称
     * @returns {Promise<boolean>} 是否加载成功
     */
    async loadMonitor(moduleName) {
        try {
            // 检查模块是否已加载
            if (this.activeMonitors.has(moduleName)) {
                this.logger.warn(`模块 ${moduleName} 已加载`);
                return true;
            }

            // 检查模块是否启用
            const config = this.sharedServices.config;
            if (!config.isModuleEnabled(moduleName)) {
                this.logger.warn(`模块 ${moduleName} 未启用`);
                return false;
            }

            // 获取模块加载器
            const loader = this.moduleLoaders.get(moduleName);
            if (!loader) {
                this.logger.error(`未找到模块 ${moduleName} 的加载器`);
                return false;
            }

            // 加载模块
            const monitor = await loader();
            if (!monitor) {
                this.logger.error(`模块 ${moduleName} 加载器返回空值`);
                return false;
            }

            // 初始化模块
            const initialized = await monitor.initialize();
            if (!initialized) {
                this.logger.error(`模块 ${moduleName} 初始化失败`);
                return false;
            }

            // 注册模块
            this.activeMonitors.set(moduleName, monitor);
            this.logger.info(`模块 ${moduleName} 加载并初始化成功`);
            return true;

        } catch (error) {
            this.logger.error(`加载模块 ${moduleName} 失败`, { error: error.message });
            return false;
        }
    }

    /**
     * 卸载监控模块
     * @param {string} moduleName - 模块名称
     * @returns {Promise<boolean>} 是否卸载成功
     */
    async unloadMonitor(moduleName) {
        try {
            const monitor = this.activeMonitors.get(moduleName);
            if (!monitor) {
                this.logger.warn(`模块 ${moduleName} 未加载`);
                return true;
            }

            // 停止模块
            await monitor.stop();

            // 移除模块
            this.activeMonitors.delete(moduleName);
            this.logger.info(`模块 ${moduleName} 已卸载`);
            return true;

        } catch (error) {
            this.logger.error(`卸载模块 ${moduleName} 失败`, { error: error.message });
            return false;
        }
    }

    /**
     * 启动所有监控模块
     * @returns {Promise<number>} 启动成功的模块数量
     */
    async startAllMonitors() {
        let startedCount = 0;

        for (const [moduleName, monitor] of this.activeMonitors.entries()) {
            try {
                const success = await monitor.start();
                if (success) {
                    startedCount++;
                    this.logger.info(`模块 ${moduleName} 启动成功`);
                } else {
                    this.logger.error(`模块 ${moduleName} 启动失败`);
                }
            } catch (error) {
                this.logger.error(`启动模块 ${moduleName} 时出错`, { error: error.message });
            }
        }

        return startedCount;
    }

    /**
     * 停止所有监控模块
     * @returns {Promise<number>} 停止成功的模块数量
     */
    async stopAllMonitors() {
        let stoppedCount = 0;

        for (const [moduleName, monitor] of this.activeMonitors.entries()) {
            try {
                const success = await monitor.stop();
                if (success) {
                    stoppedCount++;
                    this.logger.info(`模块 ${moduleName} 停止成功`);
                } else {
                    this.logger.error(`模块 ${moduleName} 停止失败`);
                }
            } catch (error) {
                this.logger.error(`停止模块 ${moduleName} 时出错`, { error: error.message });
            }
        }

        return stoppedCount;
    }

    /**
     * 启动指定监控模块
     * @param {string} moduleName - 模块名称
     * @returns {Promise<boolean>} 是否启动成功
     */
    async startMonitor(moduleName) {
        try {
            const monitor = this.activeMonitors.get(moduleName);
            if (!monitor) {
                // 尝试加载模块
                const loaded = await this.loadMonitor(moduleName);
                if (!loaded) {
                    return false;
                }
                return await this.startMonitor(moduleName);
            }

            const success = await monitor.start();
            if (success) {
                this.logger.info(`模块 ${moduleName} 启动成功`);
            }
            return success;

        } catch (error) {
            this.logger.error(`启动模块 ${moduleName} 失败`, { error: error.message });
            return false;
        }
    }

    /**
     * 停止指定监控模块
     * @param {string} moduleName - 模块名称
     * @returns {Promise<boolean>} 是否停止成功
     */
    async stopMonitor(moduleName) {
        try {
            const monitor = this.activeMonitors.get(moduleName);
            if (!monitor) {
                this.logger.warn(`模块 ${moduleName} 未加载`);
                return true;
            }

            const success = await monitor.stop();
            if (success) {
                this.logger.info(`模块 ${moduleName} 停止成功`);
            }
            return success;

        } catch (error) {
            this.logger.error(`停止模块 ${moduleName} 失败`, { error: error.message });
            return false;
        }
    }

    /**
     * 重启指定监控模块
     * @param {string} moduleName - 模块名称
     * @returns {Promise<boolean>} 是否重启成功
     */
    async restartMonitor(moduleName) {
        this.logger.info(`重启模块: ${moduleName}`);
        
        const stopped = await this.stopMonitor(moduleName);
        if (!stopped) {
            return false;
        }

        await this.sleep(1000);
        return await this.startMonitor(moduleName);
    }

    /**
     * 获取系统状态
     * @returns {Object} 系统状态信息
     */
    getSystemStatus() {
        const modules = {};
        
        for (const [moduleName, monitor] of this.activeMonitors.entries()) {
            modules[moduleName] = monitor.getStatus();
        }

        return {
            orchestrator: {
                isRunning: this.isRunning,
                totalModules: this.activeMonitors.size,
                runningModules: Array.from(this.activeMonitors.values())
                    .filter(monitor => monitor.getStatus().status === 'running').length
            },
            modules,
            sharedServices: this.getSharedServicesStatus(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 获取模块状态
     * @param {string} moduleName - 模块名称
     * @returns {Object|null} 模块状态
     */
    getModuleStatus(moduleName) {
        const monitor = this.activeMonitors.get(moduleName);
        return monitor ? monitor.getStatus() : null;
    }

    /**
     * 获取共享服务状态
     * @returns {Object} 共享服务状态
     */
    getSharedServicesStatus() {
        return {
            config: {
                isLoaded: !!this.sharedServices.config,
                enabledModules: this.sharedServices.config?.getEnabledModules() || []
            },
            database: {
                isHealthy: this.sharedServices.database?.isHealthy() || false,
                isInitialized: this.sharedServices.database?.isInitialized || false
            },
            notifier: {
                isAvailable: !!this.sharedServices.notifier
            },
            logger: {
                isAvailable: !!this.sharedServices.logger
            }
        };
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
                await this.performHealthCheck();
            } catch (error) {
                this.logger.error('健康检查执行失败', { error: error.message });
            }
        }, 60000); // 每分钟检查一次

        this.logger.info('健康检查已启动');
    }

    /**
     * 停止健康检查
     */
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            this.logger.info('健康检查已停止');
        }
    }

    /**
     * 执行健康检查
     */
    async performHealthCheck() {
        const unhealthyModules = [];

        for (const [moduleName, monitor] of this.activeMonitors.entries()) {
            try {
                const isHealthy = await monitor.isHealthy();
                if (!isHealthy) {
                    unhealthyModules.push(moduleName);
                    this.logger.warn(`模块 ${moduleName} 健康检查失败`);
                    
                    // 记录故障并尝试自动恢复
                    await this.handleModuleFailure(moduleName);
                }
            } catch (error) {
                this.logger.error(`模块 ${moduleName} 健康检查出错`, { error: error.message });
                unhealthyModules.push(moduleName);
                
                // 记录故障并尝试自动恢复
                await this.handleModuleFailure(moduleName, error);
            }
        }

        if (unhealthyModules.length > 0) {
            this.logger.warn(`发现 ${unhealthyModules.length} 个不健康的模块: ${unhealthyModules.join(', ')}`);
        }
    }

    /**
     * 初始化模块状态跟踪
     */
    initializeModuleTracking() {
        this.moduleStates.clear();
        this.failureCounters.clear();
        this.recoveryAttempts.clear();
        
        this.logger.info('模块状态跟踪已初始化');
    }

    /**
     * 处理模块故障
     * @param {string} moduleName - 模块名称
     * @param {Error} error - 错误对象（可选）
     */
    async handleModuleFailure(moduleName, error = null) {
        try {
            // 增加故障计数
            const currentFailures = this.failureCounters.get(moduleName) || 0;
            this.failureCounters.set(moduleName, currentFailures + 1);

            // 更新模块状态
            this.moduleStates.set(moduleName, {
                status: 'failed',
                lastFailure: new Date().toISOString(),
                failureCount: currentFailures + 1,
                error: error ? error.message : 'Health check failed'
            });

            this.logger.error(`模块 ${moduleName} 故障 (第${currentFailures + 1}次)`, {
                error: error ? error.message : 'Health check failed'
            });

            // 检查是否需要隔离模块
            if (currentFailures + 1 >= this.maxFailureCount) {
                await this.isolateModule(moduleName);
                return;
            }

            // 尝试自动恢复
            await this.attemptModuleRecovery(moduleName);

        } catch (recoveryError) {
            this.logger.error(`处理模块故障时出错: ${moduleName}`, { 
                error: recoveryError.message 
            });
        }
    }

    /**
     * 隔离故障模块
     * @param {string} moduleName - 模块名称
     */
    async isolateModule(moduleName) {
        try {
            this.logger.warn(`隔离故障模块: ${moduleName}`);

            // 停止模块
            const monitor = this.activeMonitors.get(moduleName);
            if (monitor) {
                try {
                    await monitor.stop();
                } catch (error) {
                    this.logger.error(`停止故障模块失败: ${moduleName}`, { error: error.message });
                }
            }

            // 更新模块状态为隔离
            this.moduleStates.set(moduleName, {
                status: 'isolated',
                isolatedAt: new Date().toISOString(),
                failureCount: this.failureCounters.get(moduleName) || 0,
                reason: 'Too many failures'
            });

            // 发送隔离通知
            await this.notifyModuleIsolation(moduleName);

            this.logger.warn(`模块 ${moduleName} 已被隔离，不会自动重启`);

        } catch (error) {
            this.logger.error(`隔离模块失败: ${moduleName}`, { error: error.message });
        }
    }

    /**
     * 尝试模块恢复
     * @param {string} moduleName - 模块名称
     */
    async attemptModuleRecovery(moduleName) {
        try {
            const currentAttempts = this.recoveryAttempts.get(moduleName) || 0;
            
            if (currentAttempts >= this.maxRecoveryAttempts) {
                this.logger.error(`模块 ${moduleName} 恢复尝试次数超限，停止自动恢复`);
                await this.isolateModule(moduleName);
                return;
            }

            this.recoveryAttempts.set(moduleName, currentAttempts + 1);
            
            this.logger.info(`尝试恢复模块 ${moduleName} (第${currentAttempts + 1}次)`);

            // 等待恢复延迟
            const delay = this.recoveryDelay * Math.pow(2, currentAttempts); // 指数退避
            await this.sleep(delay);

            // 尝试重启模块
            const recovered = await this.restartMonitor(moduleName);
            
            if (recovered) {
                // 恢复成功，重置计数器
                this.failureCounters.set(moduleName, 0);
                this.recoveryAttempts.set(moduleName, 0);
                
                this.moduleStates.set(moduleName, {
                    status: 'recovered',
                    recoveredAt: new Date().toISOString(),
                    recoveryAttempts: currentAttempts + 1
                });

                this.logger.info(`模块 ${moduleName} 恢复成功`);
                
                // 发送恢复通知
                await this.notifyModuleRecovery(moduleName);
            } else {
                this.logger.warn(`模块 ${moduleName} 恢复失败，将在下次健康检查时重试`);
            }

        } catch (error) {
            this.logger.error(`模块恢复尝试失败: ${moduleName}`, { error: error.message });
        }
    }

    /**
     * 手动恢复被隔离的模块
     * @param {string} moduleName - 模块名称
     * @returns {Promise<boolean>} 是否恢复成功
     */
    async recoverIsolatedModule(moduleName) {
        try {
            const moduleState = this.moduleStates.get(moduleName);
            if (!moduleState || moduleState.status !== 'isolated') {
                this.logger.warn(`模块 ${moduleName} 未被隔离或不存在`);
                return false;
            }

            this.logger.info(`手动恢复被隔离的模块: ${moduleName}`);

            // 重置计数器
            this.failureCounters.set(moduleName, 0);
            this.recoveryAttempts.set(moduleName, 0);

            // 尝试重启模块
            const recovered = await this.restartMonitor(moduleName);
            
            if (recovered) {
                this.moduleStates.set(moduleName, {
                    status: 'manually_recovered',
                    recoveredAt: new Date().toISOString(),
                    recoveryType: 'manual'
                });

                this.logger.info(`模块 ${moduleName} 手动恢复成功`);
                return true;
            } else {
                this.logger.error(`模块 ${moduleName} 手动恢复失败`);
                return false;
            }

        } catch (error) {
            this.logger.error(`手动恢复模块失败: ${moduleName}`, { error: error.message });
            return false;
        }
    }

    /**
     * 发送模块隔离通知
     * @param {string} moduleName - 模块名称
     */
    async notifyModuleIsolation(moduleName) {
        try {
            const notifier = this.sharedServices.notifier;
            if (notifier) {
                await notifier.sendNotification('system', {
                    type: 'module_isolated',
                    moduleName: moduleName,
                    timestamp: new Date().toISOString(),
                    message: `监控模块 ${moduleName} 因故障过多被隔离`
                });
            }
        } catch (error) {
            this.logger.error('发送隔离通知失败', { error: error.message });
        }
    }

    /**
     * 发送模块恢复通知
     * @param {string} moduleName - 模块名称
     */
    async notifyModuleRecovery(moduleName) {
        try {
            const notifier = this.sharedServices.notifier;
            if (notifier) {
                await notifier.sendNotification('system', {
                    type: 'module_recovered',
                    moduleName: moduleName,
                    timestamp: new Date().toISOString(),
                    message: `监控模块 ${moduleName} 已自动恢复正常`
                });
            }
        } catch (error) {
            this.logger.error('发送恢复通知失败', { error: error.message });
        }
    }

    /**
     * 获取模块故障统计
     * @returns {Object} 故障统计信息
     */
    getFailureStatistics() {
        const stats = {
            totalModules: this.activeMonitors.size,
            healthyModules: 0,
            failedModules: 0,
            isolatedModules: 0,
            recoveredModules: 0,
            moduleDetails: {}
        };

        for (const [moduleName, state] of this.moduleStates.entries()) {
            stats.moduleDetails[moduleName] = {
                status: state.status,
                failureCount: this.failureCounters.get(moduleName) || 0,
                recoveryAttempts: this.recoveryAttempts.get(moduleName) || 0,
                lastUpdate: state.lastFailure || state.recoveredAt || state.isolatedAt
            };

            switch (state.status) {
                case 'failed':
                    stats.failedModules++;
                    break;
                case 'isolated':
                    stats.isolatedModules++;
                    break;
                case 'recovered':
                case 'manually_recovered':
                    stats.recoveredModules++;
                    stats.healthyModules++;
                    break;
                default:
                    stats.healthyModules++;
            }
        }

        // 计算没有故障记录的健康模块
        const modulesWithoutState = this.activeMonitors.size - this.moduleStates.size;
        stats.healthyModules += modulesWithoutState;

        return stats;
    }

    /**
     * 重新加载配置并更新模块
     * @returns {Promise<boolean>} 是否重新加载成功
     */
    async reloadConfiguration() {
        try {
            this.logger.info('重新加载配置');

            // 重新加载配置
            this.sharedServices.config.loadConfig();

            // 获取新的启用模块列表
            const newEnabledModules = this.sharedServices.config.getEnabledModules();
            const currentModules = Array.from(this.activeMonitors.keys());

            // 停止不再启用的模块
            for (const moduleName of currentModules) {
                if (!newEnabledModules.includes(moduleName)) {
                    await this.unloadMonitor(moduleName);
                }
            }

            // 启动新启用的模块
            for (const moduleName of newEnabledModules) {
                if (!this.activeMonitors.has(moduleName)) {
                    await this.loadMonitor(moduleName);
                    await this.startMonitor(moduleName);
                }
            }

            this.logger.info('配置重新加载完成');
            return true;

        } catch (error) {
            this.logger.error('重新加载配置失败', { error: error.message });
            return false;
        }
    }

    // ==================== 模块加载器 ====================

    /**
     * 加载Twitter监控模块
     * @returns {Promise<Object>} Twitter监控实例
     */
    async loadTwitterModule() {
        try {
            const { TwitterMonitor } = await import('./monitors/twitter/TwitterMonitor.js');
            const config = this.sharedServices.config.getModuleConfig('twitter');
            
            return new TwitterMonitor(this.sharedServices, config);
        } catch (error) {
            this.logger.error('加载Twitter模块失败', { error: error.message });
            return null;
        }
    }

    /**
     * 加载币安监控模块
     * @returns {Promise<Object>} 币安监控实例
     */
    async loadBinanceModule() {
        try {
            const { BinanceWebSocketMonitor } = await import('./monitors/binance/BinanceWebSocketMonitor.js');
            const config = this.sharedServices.config.getModuleConfig('binance');

            return new BinanceWebSocketMonitor(this.sharedServices, config);
        } catch (error) {
            this.logger.error('加载币安模块失败', { error: error.message });
            return null;
        }
    }

    /**
     * 更新模块配置
     * @param {string} moduleName - 模块名称
     * @param {Object} config - 新配置
     * @returns {Promise<boolean>} 是否更新成功
     */
    async updateModuleConfig(moduleName, config) {
        try {
            const monitor = this.activeMonitors.get(moduleName);
            if (!monitor) {
                this.logger.error(`模块 ${moduleName} 未加载`);
                return false;
            }

            // 更新配置
            monitor.config = { ...monitor.config, ...config };
            
            // 重启模块以应用新配置
            const restarted = await this.restartMonitor(moduleName);
            
            if (restarted) {
                this.logger.info(`模块 ${moduleName} 配置更新成功`);
            }
            
            return restarted;

        } catch (error) {
            this.logger.error(`更新模块配置失败: ${moduleName}`, { error: error.message });
            return false;
        }
    }

    /**
     * 获取所有活跃监控模块
     * @returns {Array} 活跃模块列表
     */
    getActiveModules() {
        return Array.from(this.activeMonitors.keys());
    }

    /**
     * 检查模块是否已加载
     * @param {string} moduleName - 模块名称
     * @returns {boolean} 是否已加载
     */
    isModuleLoaded(moduleName) {
        return this.activeMonitors.has(moduleName);
    }

    /**
     * 获取模块实例
     * @param {string} moduleName - 模块名称
     * @returns {Object|null} 模块实例
     */
    getModuleInstance(moduleName) {
        return this.activeMonitors.get(moduleName) || null;
    }

    /**
     * 批量操作多个模块
     * @param {Array} moduleNames - 模块名称列表
     * @param {string} operation - 操作类型 (start, stop, restart)
     * @returns {Promise<Object>} 操作结果
     */
    async batchModuleOperation(moduleNames, operation) {
        const results = {
            success: [],
            failed: []
        };

        for (const moduleName of moduleNames) {
            try {
                let success = false;
                
                switch (operation) {
                    case 'start':
                        success = await this.startMonitor(moduleName);
                        break;
                    case 'stop':
                        success = await this.stopMonitor(moduleName);
                        break;
                    case 'restart':
                        success = await this.restartMonitor(moduleName);
                        break;
                    default:
                        throw new Error(`未知操作: ${operation}`);
                }

                if (success) {
                    results.success.push(moduleName);
                } else {
                    results.failed.push(moduleName);
                }

            } catch (error) {
                this.logger.error(`批量操作失败: ${moduleName}`, { error: error.message });
                results.failed.push(moduleName);
            }
        }

        this.logger.info(`批量${operation}操作完成`, {
            success: results.success.length,
            failed: results.failed.length
        });

        return results;
    }

    /**
     * 获取系统性能指标
     * @returns {Object} 性能指标
     */
    getPerformanceMetrics() {
        const metrics = {
            orchestrator: {
                uptime: this.isRunning ? Date.now() - this.startTime : 0,
                totalModules: this.activeMonitors.size,
                runningModules: 0,
                healthyModules: 0
            },
            modules: {}
        };

        for (const [moduleName, monitor] of this.activeMonitors.entries()) {
            const status = monitor.getStatus();
            
            if (status.status === 'running') {
                metrics.orchestrator.runningModules++;
            }
            
            if (status.isHealthy) {
                metrics.orchestrator.healthyModules++;
            }

            metrics.modules[moduleName] = {
                status: status.status,
                uptime: status.uptime,
                statistics: status.statistics,
                isHealthy: status.isHealthy
            };
        }

        return metrics;
    }

    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}