/**
 * 简化的监控编排器
 * 专注于核心功能，减少复杂性
 */
import { createMonitor, getAvailableMonitors } from './monitors/registry.js';

export class MonitorOrchestrator {
    constructor(sharedServices) {
        this.sharedServices = sharedServices;
        this.activeMonitors = new Map();
        this.isRunning = false;
        this.healthCheckInterval = null;
    }

    /**
     * 启动编排器
     * @returns {Promise<boolean>} 是否启动成功
     */
    async start() {
        try {
            if (this.isRunning) {
                console.log('⚠️  监控编排器已在运行中');
                return true;
            }

            console.log('🎯 启动监控编排器...');

            // 加载并启动监控模块
            const loadedCount = await this.loadAndStartMonitors();
            if (loadedCount === 0) {
                console.log('⚠️  没有启动任何监控模块');
                return false;
            }

            // 启动健康检查
            this.startHealthCheck();

            this.isRunning = true;
            console.log(`✅ 监控编排器启动成功，运行中的模块: ${loadedCount}`);
            return true;

        } catch (error) {
            console.error('❌ 监控编排器启动失败:', error.message);
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
                console.log('⚠️  监控编排器未在运行');
                return true;
            }

            console.log('⏹️  停止监控编排器...');

            // 停止健康检查
            this.stopHealthCheck();

            // 停止所有监控模块
            await this.stopAllMonitors();

            this.isRunning = false;
            console.log('✅ 监控编排器已停止');
            return true;

        } catch (error) {
            console.error('❌ 监控编排器停止失败:', error.message);
            return false;
        }
    }

    /**
     * 加载并启动监控模块
     * @returns {Promise<number>} 启动的模块数量
     */
    async loadAndStartMonitors() {
        const enabledModules = this.sharedServices.config.getEnabledModules();
        console.log(`📦 准备启动模块: ${enabledModules.join(', ')}`);

        let startedCount = 0;

        for (const moduleName of enabledModules) {
            try {
                // 获取模块配置
                const moduleConfig = this.sharedServices.config.getModuleConfig(moduleName);
                if (!moduleConfig.enabled) {
                    console.log(`⏭️  跳过未启用的模块: ${moduleName}`);
                    continue;
                }

                // 创建监控器实例
                const monitor = await createMonitor(moduleName, this.sharedServices, moduleConfig);
                if (!monitor) {
                    console.error(`❌ 创建监控器失败: ${moduleName}`);
                    continue;
                }

                // 启动监控器
                const started = await monitor.start();
                if (started) {
                    this.activeMonitors.set(moduleName, monitor);
                    startedCount++;
                    console.log(`✅ 模块 ${moduleName} 启动成功`);
                } else {
                    console.error(`❌ 模块 ${moduleName} 启动失败`);

                    // 为Twitter官方API模块提供特殊提示
                    if (moduleName === 'twitter-official') {
                        console.log('');
                        console.log('🚨 Twitter官方API模块启动失败！');
                        console.log('');
                        console.log('📋 可能的原因：');
                        console.log('1. 缺少Twitter官方API凭证配置');
                        console.log('2. 未完成OAuth认证流程');
                        console.log('3. BitBrowser指纹浏览器未启动');
                        console.log('');
                        console.log('🛠️ 解决步骤：');
                        console.log('1. 检查刷新令牌状态: npm run twitter:official:refresh-token:check');
                        console.log('2. 启动BitBrowser指纹浏览器');
                        console.log('3. 进行刷新令牌认证: npm run twitter:official:refresh-token:auth');
                        console.log('4. 重新启动系统: npm run dev');
                        console.log('');
                        console.log('📚 详细配置说明: src/monitors/twitter/official/README.md');
                        console.log('');
                    }

                    // 为Twitter OpenAPI模块提供特殊提示
                    if (moduleName === 'twitter-openapi') {
                        console.log('');
                        console.log('🚨 Twitter OpenAPI模块启动失败！');
                        console.log('');
                        console.log('📋 可能的原因：');
                        console.log('1. 缺少Twitter OpenAPI凭证配置');
                        console.log('2. Cookie已过期或无效');
                        console.log('3. 网络连接问题或代理配置错误');
                        console.log('4. Twitter账号被限制');
                        console.log('');
                        console.log('🛠️ 解决步骤：');
                        console.log('1. 管理OpenAPI凭证: npm run twitter:openapi:credentials');
                        console.log('2. 重新获取Twitter Cookie (auth_token, ct0)');
                        console.log('3. 检查代理配置和网络连接');
                        console.log('4. 验证Twitter账号状态');
                        console.log('5. 重新启动系统: npm run dev');
                        console.log('');
                        console.log('📚 详细配置说明: src/monitors/twitter/openapi/README.md');
                        console.log('');
                    }
                }

            } catch (error) {
                console.error(`❌ 处理模块 ${moduleName} 时出错:`, error.message);
            }
        }

        return startedCount;
    }

    /**
     * 停止所有监控模块
     */
    async stopAllMonitors() {
        const stopPromises = [];

        for (const [moduleName, monitor] of this.activeMonitors.entries()) {
            console.log(`⏹️  停止模块: ${moduleName}`);
            stopPromises.push(
                monitor.stop().catch(error => {
                    console.error(`❌ 停止模块 ${moduleName} 失败:`, error.message);
                })
            );
        }

        await Promise.all(stopPromises);
        this.activeMonitors.clear();
    }

    /**
     * 启动健康检查
     */
    startHealthCheck() {
        // 每5分钟检查一次
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 5 * 60 * 1000);

        console.log('💓 健康检查已启动');
    }

    /**
     * 停止健康检查
     */
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            console.log('💓 健康检查已停止');
        }
    }

    /**
     * 执行健康检查
     */
    async performHealthCheck() {
        for (const [moduleName, monitor] of this.activeMonitors.entries()) {
            try {
                const isHealthy = monitor.isHealthy ? await monitor.isHealthy() : true;
                if (!isHealthy) {
                    console.warn(`⚠️  模块 ${moduleName} 健康检查失败`);
                    // 简单的重启尝试
                    await this.restartModule(moduleName);
                }
            } catch (error) {
                console.error(`❌ 模块 ${moduleName} 健康检查出错:`, error.message);
            }
        }
    }

    /**
     * 重启模块
     * @param {string} moduleName - 模块名称
     */
    async restartModule(moduleName) {
        const monitor = this.activeMonitors.get(moduleName);
        if (!monitor) {
            return;
        }

        try {
            console.log(`🔄 重启模块: ${moduleName}`);
            await monitor.restart();
            console.log(`✅ 模块 ${moduleName} 重启成功`);
        } catch (error) {
            console.error(`❌ 重启模块 ${moduleName} 失败:`, error.message);
        }
    }

    /**
     * 获取系统状态
     * @returns {Object} 系统状态
     */
    getSystemStatus() {
        const moduleStatuses = {};
        
        for (const [moduleName, monitor] of this.activeMonitors.entries()) {
            moduleStatuses[moduleName] = monitor.getStatus ? monitor.getStatus() : {
                status: 'unknown',
                moduleName
            };
        }

        return {
            orchestrator: {
                status: this.isRunning ? 'running' : 'stopped',
                activeModules: this.activeMonitors.size,
                enabledModules: this.sharedServices.config.getEnabledModules()
            },
            modules: moduleStatuses,
            sharedServices: {
                config: '✅',
                database: this.sharedServices.database ? '✅' : '❌',
                notifier: this.sharedServices.notifier ? '✅' : '❌'
            }
        };
    }
}
