import { twitterMonitor } from './monitor.js';
import { configManager } from './config.js';
import { databaseManager } from './database.js';
import http from 'http';

/**
 * Twitter多用户监控系统主程序
 */
class TwitterMonitorApp {
    constructor() {
        this.isRunning = false;
        this.startTime = null;
        this.httpServer = null;
        
        // 使用UTC时间
        process.env.TZ = 'UTC';
    }

    /**
     * 获取当前UTC时间
     * @returns {Date} UTC时间的Date对象
     */
    getCurrentUTCTime() {
        return new Date();
    }

    /**
     * 检查API凭证认证状态
     * @param {Object} config - 配置对象
     * @returns {Promise<Object>} 认证状态检查结果
     */
    async checkAuthenticationStatus(config) {
        const result = {
            allAuthenticated: true,
            authenticatedCount: 0,
            totalCount: 0,
            unauthenticatedCredentials: []
        };

        try {
            // 收集所有凭证
            const allCredentials = [];
            for (const user of config.monitoredUsers) {
                for (const credential of user.apiCredentials) {
                    allCredentials.push({
                        ...credential,
                        monitorUser: user.xMonitorNickName
                    });
                }
            }

            result.totalCount = allCredentials.length;

            // 检查每个凭证的认证状态
            for (const credential of allCredentials) {
                const refreshToken = await databaseManager.getRefreshToken(credential.xUserName);
                
                if (refreshToken) {
                    result.authenticatedCount++;
                } else {
                    result.allAuthenticated = false;
                    result.unauthenticatedCredentials.push({
                        id: credential.xUserName,
                        monitorUser: credential.monitorUser
                    });
                }
            }

            return result;

        } catch (error) {
            console.error('检查认证状态时出错:', error.message);
            result.allAuthenticated = false;
            return result;
        }
    }

    /**
     * 系统启动流程
     */
    async start() {
        try {
            console.log('🚀 Twitter多用户监控系统启动中...');
            this.startTime = new Date();

            // 1. 初始化数据库连接
            console.log('🗄️  初始化数据库连接...');
            const dbSuccess = await databaseManager.initialize();
            if (!dbSuccess) {
                throw new Error('数据库初始化失败');
            }
            console.log('✅ 数据库连接成功');

            // 2. 加载环境变量配置
            console.log('📋 加载环境变量配置...');
            const config = configManager.loadConfig();
            if (!config) {
                throw new Error('环境变量配置加载失败');
            }
            console.log(`✅ 配置加载成功，监控用户数: ${config.monitoredUsers?.length || 0}`);

            // 3. 检查钉钉配置
            if (!config.dingtalkAccessToken) {
                console.warn('⚠️  未配置钉钉访问令牌，将无法发送通知');
            } else {
                console.log('✅ 钉钉通知配置已就绪');
            }

            // 4. 检查API凭证认证状态
            console.log('🔐 检查API凭证认证状态...');
            if (config.monitoredUsers.length === 0) {
                console.error('❌ 系统启动失败：没有配置任何监控用户');
                process.exit(1);
            }

            // 检查认证状态
            const authCheckResult = await this.checkAuthenticationStatus(config);
            if (!authCheckResult.allAuthenticated) {
                console.warn('⚠️  部分API凭证未认证，可能影响监控功能');
                console.warn('💡 建议运行以下命令完成认证:');
                console.warn('   - 认证所有凭证: npm run auth');
                console.warn('   - 检查认证状态: npm run auth:check');
                
                // 显示未认证的凭证详情
                if (authCheckResult.unauthenticatedCredentials.length > 0) {
                    console.warn('📋 未认证的凭证:');
                    authCheckResult.unauthenticatedCredentials.forEach(cred => {
                        console.warn(`   - ${cred.id} (${cred.monitorUser})`);
                    });
                }
                
                // 在生产环境中，如果没有任何认证凭证则停止启动
                if (authCheckResult.authenticatedCount === 0) {
                    console.error('❌ 系统启动失败：没有任何已认证的API凭证');
                    console.error('💡 请先运行 npm run auth 完成认证');
                    process.exit(1);
                }
            } else {
                console.log('✅ 所有API凭证认证状态正常');
            }

            // 4. 初始化调度监控
            console.log('⏰ 初始化调度监控系统...');
            
            // 从配置文件读取监控设置
            const settings = config.monitorSettings || {};
            const testMode = settings.testMode || false;
            const startTime = settings.startTime || "09:00";
            const endTime = settings.endTime || "00:00";
            const testIntervalMinutes = settings.testIntervalMinutes || 2;
            
            if (testMode) {
                // 获取当前UTC时间用于显示
                const utcTime = this.getCurrentUTCTime();
                const utcTimeStr = utcTime.toISOString();
                console.log(`🧪 测试模式启用 - 从当前UTC时间 ${utcTimeStr} 开始，每${testIntervalMinutes}分钟监控一次`);
            } else {
                console.log(`⏰ 监控时间: ${startTime} - ${endTime === "00:00" ? '24:00' : endTime} (UTC时间)`);
            }
            
            const initSuccess = twitterMonitor.initializeScheduledMonitoring();
            if (!initSuccess) {
                throw new Error('调度监控系统初始化失败');
            }
            console.log('✅ 调度监控系统初始化成功');

            // 5. 启动监控
            console.log('🎯 启动监控任务...');
            const startSuccess = twitterMonitor.startScheduledMonitoring();
            if (!startSuccess) {
                throw new Error('监控任务启动失败');
            }

            this.isRunning = true;
            console.log('🎉 Twitter多用户监控系统启动成功！');
            
            // 显示系统状态
            await this.showSystemStatus();

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
                    const monitorStatus = twitterMonitor.getMonitorStatus();
                    const authStatus = await twitterMonitor.getAuthenticationStatus();
                    const storageStats = twitterMonitor.getStorageStats();
                    const todayStats = twitterMonitor.getTodayStats();
                    
                    const detailedStatus = {
                        system: {
                            isRunning: this.isRunning,
                            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
                            startTime: this.startTime?.toISOString()
                        },
                        monitoring: monitorStatus,
                        authentication: authStatus,
                        storage: storageStats,
                        todayStats: todayStats,
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
            console.error('HTTP服务器错误:', error.message);
        });
    }

    /**
     * 显示系统状态
     */
    async showSystemStatus() {
        try {
            console.log('\n📊 系统状态报告:');
            console.log('================');

            // 监控状态
            const monitorStatus = twitterMonitor.getMonitorStatus();
            console.log(`监控状态: ${monitorStatus.isMonitoring ? '✅ 运行中' : '❌ 已停止'}`);
            console.log(`监控用户: ${monitorStatus.totalUsers} 个`);
            console.log(`活跃客户端: ${monitorStatus.activeClients} 个`);

            // 调度状态
            const scheduleStatus = twitterMonitor.scheduleManager?.getScheduleStatus();
            if (scheduleStatus) {
                console.log(`调度任务: ${scheduleStatus.isRunning ? '✅ 运行中' : '❌ 已停止'}`);
                
                // 显示每个用户的调度信息
                Object.entries(scheduleStatus.users).forEach(([nickname, userInfo]) => {
                    console.log(`  - ${nickname}: ${userInfo.taskCount} 个时间点`);
                });
            }

            // 认证状态
            const authStatus = await twitterMonitor.getAuthenticationStatus();
            if (authStatus) {
                console.log(`API凭证: ${authStatus.totalCredentials} 个`);
                Object.entries(authStatus.userStatus).forEach(([nickname, userAuth]) => {
                    const validRatio = `${userAuth.validCredentials}/${userAuth.totalCredentials}`;
                    console.log(`  - ${nickname}: ${validRatio} 个有效凭证`);
                });
            }

            // 存储状态
            const storageStats = twitterMonitor.getStorageStats();
            if (storageStats) {
                console.log(`数据存储: ${storageStats.totalFiles} 个文件, ${storageStats.totalSizeFormatted}`);
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
                const utcTime = this.getCurrentUTCTime();
                console.log(`\n⏰ 定期状态报告 - ${utcTime.toISOString()}`);
                await this.showSystemStatus();
                
                // 显示今日统计
                const todayStats = twitterMonitor.getTodayStats();
                if (todayStats.totalTweets > 0) {
                    console.log(`📈 今日推文统计: ${todayStats.totalTweets} 条`);
                    Object.entries(todayStats.userBreakdown).forEach(([nickname, count]) => {
                        console.log(`  - ${nickname}: ${count} 条`);
                    });
                }
            }
        }, 60 * 60 * 1000); // 1小时

        // 每天清理一次旧数据
        setInterval(() => {
            if (this.isRunning) {
                console.log('🧹 执行数据清理任务...');
                twitterMonitor.cleanupOldData(30); // 保留30天
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
                
                // 停止监控
                console.log('⏹️  停止监控任务...');
                twitterMonitor.stopScheduledMonitoring();
                
                // 保存数据
                console.log('💾 保存数据...');
                twitterMonitor.saveDataToFile();
                
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
            const monitorStatus = twitterMonitor.getMonitorStatus();
            const authStatus = await twitterMonitor.getAuthenticationStatus();
            const storageStats = twitterMonitor.getStorageStats();
            
            return {
                status: this.isRunning && monitorStatus.isMonitoring ? 'healthy' : 'unhealthy',
                uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
                monitoring: {
                    isRunning: monitorStatus.isMonitoring,
                    totalUsers: monitorStatus.totalUsers,
                    activeClients: monitorStatus.activeClients
                },
                authentication: {
                    totalCredentials: authStatus?.totalCredentials || 0,
                    validCredentials: Object.values(authStatus?.userStatus || {})
                        .reduce((sum, user) => sum + user.validCredentials, 0)
                },
                storage: {
                    totalFiles: storageStats?.totalFiles || 0,
                    totalSize: storageStats?.totalSize || 0
                },
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
const app = new TwitterMonitorApp();

// 如果直接运行此文件，启动应用
if (import.meta.url === `file://${process.argv[1]}`) {
    app.start().catch(error => {
        console.error('应用启动失败:', error);
        process.exit(1);
    });
}

// 导出应用实例供其他模块使用
export { app as twitterMonitorApp };