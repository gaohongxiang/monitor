#!/usr/bin/env node

/**
 * 部署验证脚本
 * 验证系统是否正确部署和配置
 */

import { configManager } from './src/config.js';
import { databaseManager } from './src/database.js';
import { DingTalkNotifier } from './src/notifier.js';

async function verifyDeployment() {
    console.log('🚀 开始部署验证...\n');
    
    const results = {
        config: false,
        database: false,
        notification: false,
        environment: false,
        overall: false
    };

    try {
        // 1. 验证配置
        console.log('📋 验证配置管理...');
        try {
            const configValid = configManager.printValidationReport();
            results.config = configValid;
            console.log(`配置验证: ${configValid ? '✅ 通过' : '❌ 失败'}\n`);
        } catch (error) {
            console.log(`配置验证: ❌ 失败 - ${error.message}\n`);
        }

        // 2. 验证数据库连接
        console.log('🗄️  验证数据库连接...');
        try {
            const dbInit = await databaseManager.initialize();
            if (dbInit) {
                const healthCheck = await databaseManager.performHealthCheck();
                results.database = healthCheck.isConnected && healthCheck.tablesExist && healthCheck.canWrite && healthCheck.canRead;
                console.log(`数据库验证: ${results.database ? '✅ 通过' : '❌ 失败'}`);
                console.log(`  - 连接状态: ${healthCheck.isConnected ? '✅' : '❌'}`);
                console.log(`  - 表结构: ${healthCheck.tablesExist ? '✅' : '❌'}`);
                console.log(`  - 写入权限: ${healthCheck.canWrite ? '✅' : '❌'}`);
                console.log(`  - 读取权限: ${healthCheck.canRead ? '✅' : '❌'}\n`);
            } else {
                console.log(`数据库验证: ❌ 失败 - 无法连接数据库\n`);
            }
        } catch (error) {
            console.log(`数据库验证: ❌ 失败 - ${error.message}\n`);
        }

        // 3. 验证通知功能
        console.log('📱 验证通知功能...');
        try {
            const dingtalkToken = configManager.getDingtalkAccessToken();
            if (dingtalkToken) {
                const notifier = new DingTalkNotifier(dingtalkToken);
                const notificationTest = await notifier.testConnection();
                results.notification = notificationTest;
                console.log(`通知验证: ${notificationTest ? '✅ 通过' : '❌ 失败'}\n`);
            } else {
                console.log(`通知验证: ⚠️  跳过 - 未配置钉钉访问令牌\n`);
                results.notification = true; // 可选功能，不影响整体验证
            }
        } catch (error) {
            console.log(`通知验证: ❌ 失败 - ${error.message}\n`);
        }

        // 4. 验证环境配置
        console.log('🌍 验证环境配置...');
        try {
            const envValidation = configManager.validateEnvironmentConfiguration();
            results.environment = envValidation.isValid;
            console.log(`环境验证: ${envValidation.isValid ? '✅ 通过' : '❌ 失败'}`);
            
            if (envValidation.errors.length > 0) {
                console.log('错误:');
                envValidation.errors.forEach(error => console.log(`  - ${error}`));
            }
            
            if (envValidation.warnings.length > 0) {
                console.log('警告:');
                envValidation.warnings.forEach(warning => console.log(`  - ${warning}`));
            }
            console.log();
        } catch (error) {
            console.log(`环境验证: ❌ 失败 - ${error.message}\n`);
        }

        // 5. 整体验证结果
        results.overall = results.config && results.database && results.notification && results.environment;

        console.log('📊 验证结果汇总');
        console.log('='.repeat(40));
        console.log(`配置管理: ${results.config ? '✅ 通过' : '❌ 失败'}`);
        console.log(`数据库连接: ${results.database ? '✅ 通过' : '❌ 失败'}`);
        console.log(`通知功能: ${results.notification ? '✅ 通过' : '❌ 失败'}`);
        console.log(`环境配置: ${results.environment ? '✅ 通过' : '❌ 失败'}`);
        console.log('='.repeat(40));
        console.log(`整体状态: ${results.overall ? '✅ 部署成功' : '❌ 部署失败'}`);

        // 6. 系统信息
        console.log('\n📈 系统信息');
        console.log('='.repeat(40));
        const envInfo = configManager.getEnvironmentInfo();
        console.log(`运行环境: ${envInfo.nodeEnv}`);
        console.log(`部署平台: ${envInfo.deploymentPlatform}`);
        console.log(`Node.js版本: ${process.version}`);
        console.log(`时区: ${envInfo.timezone}`);
        console.log(`端口: ${envInfo.port}`);
        console.log(`构建版本: ${envInfo.buildVersion}`);
        console.log(`调试模式: ${envInfo.enableDebug ? '启用' : '禁用'}`);
        console.log(`测试模式: ${envInfo.testMode ? '启用' : '禁用'}`);

        if (results.database) {
            const dbStats = await databaseManager.getDatabaseStats();
            if (dbStats) {
                console.log('\n📊 数据库统计');
                console.log('='.repeat(40));
                console.log(`refreshToken数: ${dbStats.refreshTokens}`);
                console.log(`监控状态数: ${dbStats.monitorStates}`);
                console.log(`监控统计数: ${dbStats.monitorStats}`);
                console.log(`API使用统计数: ${dbStats.apiUsageStats}`);
                console.log(`数据库大小: ${dbStats.databaseSize}`);
            }
        }

        // 7. 部署建议
        console.log('\n💡 部署建议');
        console.log('='.repeat(40));
        
        if (!results.config) {
            console.log('❌ 配置问题需要解决');
            console.log('   - 检查环境变量设置');
            console.log('   - 验证API凭证格式');
        }
        
        if (!results.database) {
            console.log('❌ 数据库问题需要解决');
            console.log('   - 检查数据库连接URL');
            console.log('   - 确认数据库服务运行状态');
            console.log('   - 验证数据库权限');
        }
        
        if (!results.notification) {
            console.log('⚠️  通知功能需要配置');
            console.log('   - 设置钉钉访问令牌');
            console.log('   - 测试钉钉机器人连接');
        }
        
        if (!results.environment) {
            console.log('❌ 环境配置需要优化');
            console.log('   - 检查环境特定配置');
            console.log('   - 验证生产环境设置');
        }

        if (results.overall) {
            console.log('✅ 系统部署成功，可以正常运行');
            console.log('✅ 所有核心功能验证通过');
            console.log('✅ 建议定期运行此验证脚本');
        } else {
            console.log('❌ 系统部署存在问题，需要修复后再运行');
        }

        // 8. 下一步操作
        console.log('\n🚀 下一步操作');
        console.log('='.repeat(40));
        
        if (results.overall) {
            console.log('1. 启动监控服务: npm start');
            console.log('2. 查看运行日志: tail -f data/monitor/logs/monitor_*.log');
            console.log('3. 监控系统状态: 定期检查健康状态');
            console.log('4. 配置监控告警: 设置系统监控和告警');
        } else {
            console.log('1. 修复上述问题');
            console.log('2. 重新运行验证: node verify_deployment.js');
            console.log('3. 查看详细日志获取更多信息');
        }

        console.log('\n' + '='.repeat(50));
        
        // 退出码
        process.exit(results.overall ? 0 : 1);

    } catch (error) {
        console.error('❌ 部署验证过程中出现错误:', error.message);
        console.error('错误详情:', error.stack);
        process.exit(1);
    } finally {
        // 清理资源
        if (databaseManager.isHealthy()) {
            await databaseManager.close();
        }
    }
}

// 运行验证
verifyDeployment().catch(console.error);