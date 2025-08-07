import { MonitorOrchestrator } from './orchestrator.js';
import { unifiedConfigManager } from './core/config.js';
import { unifiedDatabaseManager } from './core/database.js';
import { createUnifiedNotifier } from './core/notifier.js';
import { unifiedLoggerManager } from './core/logger.js';
import http from 'http';

/**
 * 多监控源系统主程序
 */
class MultiSourceMonitorApp {
    constructor() {
        this.isRunning = false;
        this.startTime = null;
        this.httpServer = null;
        this.orchestrator = null;
        this.sharedServices = {};

        // 使用UTC时间
        process.env.TZ = 'UTC';
    }

    /**
     * 初始化共享服务
     * @returns {Promise<boolean>} 是否初始化成功
     */
    async initializeSharedServices() {
        try {
            console.log('🔧 初始化共享服务...');

            // 1. 初始化配置管理器
            console.log('📋 加载统一配置...');
            const config = unifiedConfigManager.loadConfig();
            if (!config) {
                throw new Error('配置加载失败');
            }
            this.sharedServices.config = unifiedConfigManager;
            console.log(`✅ 配置加载成功，启用模块: ${config.system.enabledModules.join(', ')}`);

            // 2. 初始化数据库管理器（仅Twitter监控需要）
            if (config.system.enabledModules.includes('twitter')) {
                console.log('🗄️  初始化数据库连接...');
                const dbSuccess = await unifiedDatabaseManager.initialize(config.shared.database);
                if (!dbSuccess) {
                    throw new Error('数据库初始化失败');
                }
                this.sharedServices.database = unifiedDatabaseManager;
                console.log('✅ 数据库连接成功');
            } else {
                console.log('ℹ️  跳过数据库初始化（仅Binance监控运行，无需数据库）');
                this.sharedServices.database = null;
            }

            // 3. 初始化通知管理器
            console.log('📢 初始化通知系统...');
            const notifier = createUnifiedNotifier(config.shared.notification);
            // 只有在数据库初始化时才设置数据库管理器
            if (this.sharedServices.database) {
                notifier.setDatabaseManager(this.sharedServices.database);
            }
            this.sharedServices.notifier = notifier;
            console.log('✅ 通知系统初始化成功');

            // 4. 初始化日志管理器
            console.log('📝 初始化日志系统...');
            unifiedLoggerManager.setLogLevel(config.shared.logging.level);
            this.sharedServices.logger = unifiedLoggerManager;
            console.log('✅ 日志系统初始化成功');

            return true;

        } catch (error) {
            console.error('❌ 共享服务初始化失败:', error.message);
            return false;
        }
    }

    /**
     * 系统启动流程
     */
    async start() {
        try {
            console.log('🚀 多监控源系统启动中...');
            this.startTime = new Date();

            // 1. 初始化共享服务
            const servicesInitialized = await this.initializeSharedServices();
            if (!servicesInitialized) {
                throw new Error('共享服务初始化失败');
            }

            // 2. 创建监控编排器
            console.log('🎭 创建监控编排器...');
            this.orchestrator = new MonitorOrchestrator(this.sharedServices);

            // 3. 启动监控编排器
            console.log('🎯 启动监控编排器...');
            const orchestratorStarted = await this.orchestrator.start();
            if (!orchestratorStarted) {
                throw new Error('监控编排器启动失败');
            }

            this.isRunning = true;
            console.log('🎉 多监控源系统启动成功！');

            // 延迟显示系统状态，让模块有时间完全启动
            setTimeout(async () => {
                await this.showSystemStatus();
            }, 3000); // 3秒后显示状态

            // 设置定期状态报告
            this.setupStatusReporting();

            // 启动HTTP健康检查服务器
            this.startHealthCheckServer();

            // 设置优雅关闭
            this.setupGracefulShutdown();

        } catch (error) {
            console.error('❌ 系统启动失败:', error.message);
            process.exit(1);
        }
    }

    /**
     * 启动HTTP健康检查服务器
     */
    startHealthCheckServer() {
        const port = process.env.PORT || 3000;

        this.httpServer = http.createServer(async (req, res) => {
            // 设置CORS头
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Content-Type', 'application/json');

            if (req.method === 'GET' && req.url === '/health') {
                // 健康检查端点
                try {
                    const healthStatus = await this.getHealthStatus();
                    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;

                    res.writeHead(statusCode);
                    res.end(JSON.stringify(healthStatus, null, 2));
                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: error.message }, null, 2));
                }

            } else if (req.method === 'GET' && req.url === '/status') {
                // 详细状态端点
                try {
                    const systemStatus = this.orchestrator ? this.orchestrator.getSystemStatus() : null;

                    const detailedStatus = {
                        system: {
                            isRunning: this.isRunning,
                            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
                            startTime: this.startTime?.toISOString()
                        },
                        orchestrator: systemStatus,
                        timestamp: new Date().toISOString()
                    };

                    res.writeHead(200);
                    res.end(JSON.stringify(detailedStatus, null, 2));

                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: error.message }, null, 2));
                }

            } else {
                // 404 - 未找到
                res.writeHead(404);
                res.end(JSON.stringify({
                    error: 'Not Found',
                    availableEndpoints: ['/health', '/status']
                }, null, 2));
            }
        });

        this.httpServer.listen(port, () => {
            console.log(`🌐 HTTP健康检查服务器启动，端口: ${port}`);
            console.log(`   健康检查: http://localhost:${port}/health`);
            console.log(`   详细状态: http://localhost:${port}/status`);
        });

        this.httpServer.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.warn(`⚠️  端口 ${port} 被占用，尝试使用其他端口...`);
                // 尝试使用随机端口
                this.httpServer.listen(0, () => {
                    const actualPort = this.httpServer.address().port;
                    console.log(`🌐 HTTP健康检查服务器启动，端口: ${actualPort}`);
                    console.log(`   健康检查: http://localhost:${actualPort}/health`);
                    console.log(`   详细状态: http://localhost:${actualPort}/status`);
                });
            } else {
                console.error('❌ HTTP服务器错误:', error.message);
            }
        });
    }

    /**
     * 显示系统状态
     */
    async showSystemStatus() {
        try {
            console.log('\n📊 系统状态报告:');
            console.log('================');

            if (this.orchestrator) {
                const systemStatus = this.orchestrator.getSystemStatus();
                
                // 编排器状态
                console.log(`编排器状态: ${systemStatus.orchestrator.isRunning ? '✅ 运行中' : '❌ 已停止'}`);
                console.log(`总模块数: ${systemStatus.orchestrator.totalModules} 个`);
                console.log(`运行中模块: ${systemStatus.orchestrator.runningModules} 个`);

                // 各模块状态
                if (systemStatus.modules) {
                    Object.entries(systemStatus.modules).forEach(([moduleName, moduleStatus]) => {
                        console.log(`\n📦 模块 ${moduleName}:`);
                        console.log(`  状态: ${moduleStatus.status === 'running' ? '✅ 运行中' : '❌ 已停止'}`);
                        console.log(`  健康: ${moduleStatus.isHealthy ? '✅ 健康' : '❌ 不健康'}`);
                        console.log(`  运行时间: ${moduleStatus.uptimeFormatted || '未知'}`);
                        
                        if (moduleStatus.statistics) {
                            console.log(`  处理总数: ${moduleStatus.statistics.totalProcessed}`);
                            console.log(`  成功率: ${moduleStatus.statistics.successRate || '0%'}`);
                        }
                    });
                }

                // 共享服务状态
                const sharedStatus = systemStatus.sharedServices;
                console.log(`\n🔧 共享服务:`);
                console.log(`  配置管理: ${sharedStatus.config.isLoaded ? '✅' : '❌'}`);
                console.log(`  数据库: ${sharedStatus.database.isHealthy ? '✅' : '❌'}`);
                console.log(`  通知系统: ${sharedStatus.notifier.isAvailable ? '✅' : '❌'}`);
                console.log(`  日志系统: ${sharedStatus.logger.isAvailable ? '✅' : '❌'}`);
            } else {
                console.log('编排器未初始化');
            }

            console.log('================\n');

        } catch (error) {
            console.error('显示系统状态时出错:', error.message);
        }
    }

    /**
     * 设置定期状态报告
     */
    setupStatusReporting() {
        // 每小时显示一次状态
        setInterval(async () => {
            if (this.isRunning) {
                const utcTime = new Date();
                console.log(`\n⏰ 定期状态报告 - ${utcTime.toISOString()}`);
                await this.showSystemStatus();
            }
        }, 60 * 60 * 1000); // 1小时

        // 每天清理一次旧数据
        setInterval(() => {
            if (this.isRunning) {
                console.log('🧹 执行数据清理任务...');
                // 清理日志文件
                this.sharedServices.logger?.cleanupOldLogs(30);
            }
        }, 24 * 60 * 60 * 1000); // 24小时
    }

    /**
     * 设置优雅关闭
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n🛑 收到 ${signal} 信号，开始优雅关闭...`);

            try {
                this.isRunning = false;

                // 停止HTTP服务器
                if (this.httpServer) {
                    console.log('🌐 关闭HTTP服务器...');
                    this.httpServer.close();
                }

                // 停止监控编排器
                if (this.orchestrator) {
                    console.log('⏹️  停止监控编排器...');
                    await this.orchestrator.stop();
                }

                // 显示运行统计
                const runTime = Date.now() - this.startTime.getTime();
                const runTimeFormatted = this.formatDuration(runTime);
                console.log(`📊 系统运行时间: ${runTimeFormatted}`);

                console.log('✅ 系统已优雅关闭');
                process.exit(0);

            } catch (error) {
                console.error('❌ 关闭过程中出错:', error.message);
                process.exit(1);
            }
        };

        // 监听关闭信号
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // 监听未捕获的异常
        process.on('uncaughtException', (error) => {
            console.error('❌ 未捕获的异常:', error);

            // 如果是数据库连接错误，不退出程序，让重连机制处理
            if (error.message && (
                error.message.includes('Connection terminated') ||
                error.message.includes('connection closed') ||
                error.code === 'ECONNRESET'
            )) {
                console.log('🔄 数据库连接错误，等待重连机制处理...');
                return;
            }

            // 其他严重错误才退出程序
            console.error('🛑 严重错误，开始优雅关闭...');
            shutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ 未处理的Promise拒绝:', reason);

            // 如果是数据库连接错误，不退出程序
            if (reason && reason.message && (
                reason.message.includes('Connection terminated') ||
                reason.message.includes('connection closed') ||
                reason.code === 'ECONNRESET'
            )) {
                console.log('🔄 数据库连接Promise拒绝，等待重连机制处理...');
                return;
            }

            // 其他严重错误才退出程序
            console.error('🛑 严重Promise拒绝，开始优雅关闭...');
            shutdown('unhandledRejection');
        });
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
     * 获取系统健康状态
     * @returns {Object} 健康状态信息
     */
    async getHealthStatus() {
        try {
            const systemStatus = this.orchestrator ? this.orchestrator.getSystemStatus() : null;

            return {
                status: this.isRunning && systemStatus?.orchestrator.isRunning ? 'healthy' : 'unhealthy',
                uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
                orchestrator: {
                    isRunning: systemStatus?.orchestrator.isRunning || false,
                    totalModules: systemStatus?.orchestrator.totalModules || 0,
                    runningModules: systemStatus?.orchestrator.runningModules || 0
                },
                sharedServices: systemStatus?.sharedServices || {},
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// 创建应用实例
const app = new MultiSourceMonitorApp();

// 如果直接运行此文件，启动应用
if (import.meta.url === `file://${process.argv[1]}`) {
    app.start().catch(error => {
        console.error('应用启动失败:', error);
        process.exit(1);
    });
}

// 导出应用实例供其他模块使用
export { app as multiSourceMonitorApp };