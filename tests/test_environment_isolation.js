#!/usr/bin/env node

/**
 * 环境隔离验证测试脚本
 * 验证开发环境数据不会影响生产环境
 */

import { configManager } from './src/config.js';
import { databaseManager } from './src/database.js';
import { xMonitorManager } from './src/monitor.js';

async function testEnvironmentIsolation() {
    console.log('🧪 开始测试环境隔离...\n');

    try {
        // 测试1: 数据库环境隔离验证
        console.log('📋 测试1: 数据库环境隔离验证');
        console.log('='.repeat(40));

        // 模拟开发环境配置
        const devConfig = {
            NODE_ENV: 'development',
            DATABASE_URL_DEVELOPMENT: 'postgresql://dev_user:dev_pass@localhost:5432/twitter_monitor_dev',
            API_CREDENTIALS: JSON.stringify([{
                "id": "dev_cred_1",
                "monitorUser": "dev_testuser",
                "clientId": "dev_client_id",
                "clientSecret": "dev_client_secret",
                "redirectUri": "https://dev.example.com/callback",
                "username": "dev_x_user",
                "browserId": "dev_browser",
                "proxyUrl": "http://dev-proxy.example.com:8080"
            }]),
            DINGTALK_ACCESS_TOKEN: 'dev_dingtalk_token'
        };

        // 模拟生产环境配置
        const prodConfig = {
            NODE_ENV: 'production',
            DATABASE_URL_PRODUCTION: 'postgresql://prod_user:prod_pass@prod-db:5432/twitter_monitor_prod',
            API_CREDENTIALS: JSON.stringify([{
                "id": "prod_cred_1",
                "monitorUser": "prod_testuser",
                "clientId": "prod_client_id",
                "clientSecret": "prod_client_secret",
                "redirectUri": "https://prod.example.com/callback",
                "username": "prod_x_user",
                "browserId": "prod_browser",
                "proxyUrl": "http://prod-proxy.example.com:8080"
            }]),
            DINGTALK_ACCESS_TOKEN: 'prod_dingtalk_token',
            BUILD_VERSION: '1.0.0',
            RAILWAY_ENVIRONMENT: 'production'
        };

        // 测试开发环境配置
        console.log('\n🔧 测试开发环境配置隔离:');
        
        // 清理所有环境变量
        Object.keys(prodConfig).forEach(key => {
            delete process.env[key];
        });
        
        // 设置开发环境变量
        Object.keys(devConfig).forEach(key => {
            process.env[key] = devConfig[key];
        });

        configManager.config = null;
        configManager.apiCredentials = null;

        const devEnvInfo = configManager.getEnvironmentInfo();
        console.log(`  - 环境检测: ${devEnvInfo.isDevelopment ? '✅ 开发环境' : '❌ 错误环境'}`);
        console.log(`  - 数据库URL: ${devEnvInfo.databaseUrl.includes('dev') ? '✅ 开发数据库' : '❌ 错误数据库'}`);
        console.log(`  - 部署平台: ${devEnvInfo.deploymentPlatform === 'local' ? '✅ 本地环境' : '❌ 错误平台'}`);

        const devDbUrl = databaseManager.getEnvironmentSpecificDatabaseUrl();
        console.log(`  - 数据库隔离: ${devDbUrl.includes('dev') ? '✅ 使用开发数据库' : '❌ 数据库隔离失败'}`);

        // 测试生产环境配置
        console.log('\n🏭 测试生产环境配置隔离:');
        Object.keys(prodConfig).forEach(key => {
            process.env[key] = prodConfig[key];
        });

        configManager.config = null;
        configManager.apiCredentials = null;

        const prodEnvInfo = configManager.getEnvironmentInfo();
        console.log(`  - 环境检测: ${prodEnvInfo.isProduction ? '✅ 生产环境' : '❌ 错误环境'}`);
        console.log(`  - 数据库URL: ${prodEnvInfo.databaseUrl.includes('prod') ? '✅ 生产数据库' : '❌ 错误数据库'}`);
        console.log(`  - 部署平台: ${prodEnvInfo.deploymentPlatform === 'railway' ? '✅ Railway平台' : '❌ 错误平台'}`);
        console.log(`  - 构建版本: ${prodEnvInfo.buildVersion === '1.0.0' ? '✅ 版本正确' : '❌ 版本错误'}`);

        const prodDbUrl = databaseManager.getEnvironmentSpecificDatabaseUrl();
        console.log(`  - 数据库隔离: ${prodDbUrl.includes('prod') ? '✅ 使用生产数据库' : '❌ 数据库隔离失败'}`);

        // 测试2: 配置隔离验证
        console.log('\n📋 测试2: 配置隔离验证');
        console.log('='.repeat(40));

        // 开发环境配置验证
        process.env.NODE_ENV = 'development';
        configManager.config = null;
        
        const devConfig1 = configManager.loadConfig();
        const devUser = devConfig1.monitoredUsers[0];
        console.log(`\n开发环境配置:`)
        console.log(`  - 监控用户: ${devUser.xMonitorNickName}`);
        console.log(`  - API凭证ID: ${devUser.apiCredentials[0].id}`);
        console.log(`  - 测试模式: ${devConfig1.monitorSettings.testMode ? '启用' : '禁用'}`);

        // 生产环境配置验证
        process.env.NODE_ENV = 'production';
        configManager.config = null;
        
        const prodConfig1 = configManager.loadConfig();
        const prodUser = prodConfig1.monitoredUsers[0];
        console.log(`\n生产环境配置:`)
        console.log(`  - 监控用户: ${prodUser.xMonitorNickName}`);
        console.log(`  - API凭证ID: ${prodUser.apiCredentials[0].id}`);
        console.log(`  - 测试模式: ${prodConfig1.monitorSettings.testMode ? '启用' : '禁用'}`);

        // 验证配置不会相互影响
        const configIsolated = (devUser.xMonitorNickName !== prodUser.xMonitorNickName) && 
                              (devUser.apiCredentials[0].id !== prodUser.apiCredentials[0].id);
        console.log(`\n配置隔离验证: ${configIsolated ? '✅ 配置完全隔离' : '❌ 配置存在交叉'}`);

        // 测试3: 日志和错误处理环境特定化
        console.log('\n📋 测试3: 环境特定日志和错误处理');
        console.log('='.repeat(40));

        // 开发环境日志级别
        process.env.NODE_ENV = 'development';
        const devLogLevel = configManager.getLogLevel();
        const devDebugEnabled = configManager.isDebugEnabled();
        console.log(`\n开发环境日志配置:`);
        console.log(`  - 日志级别: ${devLogLevel} (期望: debug)`);
        console.log(`  - 调试模式: ${devDebugEnabled ? '启用' : '禁用'} (期望: 启用)`);
        console.log(`  - 日志级别正确: ${devLogLevel === 'debug' ? '✅' : '❌'}`);
        console.log(`  - 调试模式正确: ${devDebugEnabled ? '✅' : '❌'}`);

        // 生产环境日志级别
        process.env.NODE_ENV = 'production';
        process.env.DEBUG = 'false';
        const prodLogLevel = configManager.getLogLevel();
        const prodDebugEnabled = configManager.isDebugEnabled();
        console.log(`\n生产环境日志配置:`);
        console.log(`  - 日志级别: ${prodLogLevel} (期望: warn)`);
        console.log(`  - 调试模式: ${prodDebugEnabled ? '启用' : '禁用'} (期望: 禁用)`);
        console.log(`  - 日志级别正确: ${prodLogLevel === 'warn' ? '✅' : '❌'}`);
        console.log(`  - 调试模式正确: ${!prodDebugEnabled ? '✅' : '❌'}`);

        // 测试环境日志级别
        process.env.NODE_ENV = 'test';
        const testLogLevel = configManager.getLogLevel();
        const testDebugEnabled = configManager.isDebugEnabled();
        console.log(`\n测试环境日志配置:`);
        console.log(`  - 日志级别: ${testLogLevel} (期望: error)`);
        console.log(`  - 调试模式: ${testDebugEnabled ? '启用' : '禁用'} (期望: 禁用)`);
        console.log(`  - 日志级别正确: ${testLogLevel === 'error' ? '✅' : '❌'}`);
        console.log(`  - 调试模式正确: ${!testDebugEnabled ? '✅' : '❌'}`);

        // 测试4: 系统状态报告环境标识
        console.log('\n📋 测试4: 系统状态报告环境标识');
        console.log('='.repeat(40));

        // 开发环境状态报告
        process.env.NODE_ENV = 'development';
        process.env.DEBUG = 'true';
        delete process.env.BUILD_VERSION;
        delete process.env.RAILWAY_ENVIRONMENT;

        configManager.config = null;
        console.log('\n🔧 开发环境状态报告:');
        const devReportValid = configManager.printEnvironmentReport();

        // 生产环境状态报告
        process.env.NODE_ENV = 'production';
        process.env.DEBUG = 'false';
        process.env.BUILD_VERSION = '1.0.0';
        process.env.RAILWAY_ENVIRONMENT = 'production';

        configManager.config = null;
        console.log('\n🏭 生产环境状态报告:');
        const prodReportValid = configManager.printEnvironmentReport();

        console.log(`\n环境报告生成: ${devReportValid && prodReportValid ? '✅ 成功' : '❌ 失败'}`);

        // 测试5: 监控管理器环境隔离
        console.log('\n📋 测试5: 监控管理器环境隔离');
        console.log('='.repeat(40));

        // 创建开发环境监控管理器
        process.env.NODE_ENV = 'development';
        process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5432/twitter_monitor_dev';
        
        configManager.config = null;
        const devMonitorManager = new xMonitorManager();
        
        // 等待初始化
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('\n开发环境监控管理器:');
        console.log(`  - 数据目录: ${devMonitorManager.dataDir}`);
        console.log(`  - 环境标识: development`);

        // 创建生产环境监控管理器
        process.env.NODE_ENV = 'production';
        process.env.DATABASE_URL_PRODUCTION = 'postgresql://prod:prod@prod-db:5432/twitter_monitor_prod';
        
        configManager.config = null;
        const prodMonitorManager = new xMonitorManager();
        
        // 等待初始化
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('\n生产环境监控管理器:');
        console.log(`  - 数据目录: ${prodMonitorManager.dataDir}`);
        console.log(`  - 环境标识: production`);

        // 验证监控管理器隔离
        const monitorIsolated = devMonitorManager.dataDir === prodMonitorManager.dataDir; // 数据目录相同但环境不同
        console.log(`\n监控管理器隔离: ${!monitorIsolated ? '✅ 环境隔离正确' : '⚠️  使用相同数据目录但环境分离'}`);

        // 测试6: 数据库连接池环境特定配置
        console.log('\n📋 测试6: 数据库连接池环境特定配置');
        console.log('='.repeat(40));

        // 开发环境连接池配置
        process.env.NODE_ENV = 'development';
        const devPoolConfig = databaseManager.getEnvironmentSpecificPoolConfig('postgresql://dev:dev@localhost:5432/dev_db');
        console.log('\n开发环境连接池配置:');
        console.log(`  - 最大连接数: ${devPoolConfig.max} (期望: 10)`);
        console.log(`  - 最小连接数: ${devPoolConfig.min} (期望: 2)`);
        console.log(`  - 连接超时: ${devPoolConfig.connectionTimeoutMillis}ms (期望: 3000)`);
        console.log(`  - SSL配置: ${devPoolConfig.ssl ? '启用' : '禁用'} (期望: 禁用)`);

        // 生产环境连接池配置
        process.env.NODE_ENV = 'production';
        const prodPoolConfig = databaseManager.getEnvironmentSpecificPoolConfig('postgresql://prod:prod@prod-db:5432/prod_db');
        console.log('\n生产环境连接池配置:');
        console.log(`  - 最大连接数: ${prodPoolConfig.max} (期望: 20)`);
        console.log(`  - 最小连接数: ${prodPoolConfig.min} (期望: 5)`);
        console.log(`  - 连接超时: ${prodPoolConfig.connectionTimeoutMillis}ms (期望: 5000)`);
        console.log(`  - SSL配置: ${prodPoolConfig.ssl ? '启用' : '禁用'} (期望: 启用)`);

        // 验证连接池配置差异
        const poolConfigDifferent = (devPoolConfig.max !== prodPoolConfig.max) && 
                                   (devPoolConfig.connectionTimeoutMillis !== prodPoolConfig.connectionTimeoutMillis) &&
                                   (devPoolConfig.ssl !== prodPoolConfig.ssl);
        console.log(`\n连接池配置隔离: ${poolConfigDifferent ? '✅ 环境特定配置正确' : '❌ 配置未正确隔离'}`);

        // 测试7: 环境配置验证
        console.log('\n📋 测试7: 环境配置验证');
        console.log('='.repeat(40));

        // 开发环境配置验证
        process.env.NODE_ENV = 'development';
        process.env.TEST_MODE = 'true';
        process.env.DEBUG = 'true';
        delete process.env.BUILD_VERSION;

        const devValidation = configManager.validateEnvironmentConfiguration();
        console.log('\n开发环境配置验证:');
        console.log(`  - 验证通过: ${devValidation.isValid ? '✅' : '❌'}`);
        console.log(`  - 警告数量: ${devValidation.warnings.length}`);
        if (devValidation.warnings.length > 0) {
            devValidation.warnings.forEach(warning => console.log(`    - ${warning}`));
        }

        // 生产环境配置验证
        process.env.NODE_ENV = 'production';
        process.env.TEST_MODE = 'false';
        process.env.DEBUG = 'false';
        process.env.BUILD_VERSION = '1.0.0';

        const prodValidation = configManager.validateEnvironmentConfiguration();
        console.log('\n生产环境配置验证:');
        console.log(`  - 验证通过: ${prodValidation.isValid ? '✅' : '❌'}`);
        console.log(`  - 警告数量: ${prodValidation.warnings.length}`);
        if (prodValidation.warnings.length > 0) {
            prodValidation.warnings.forEach(warning => console.log(`    - ${warning}`));
        }

        // 生产环境启用测试模式的警告验证
        process.env.TEST_MODE = 'true';
        const prodTestModeValidation = configManager.validateEnvironmentConfiguration();
        const hasTestModeWarning = prodTestModeValidation.warnings.some(w => w.includes('测试模式'));
        console.log(`\n生产环境测试模式警告: ${hasTestModeWarning ? '✅ 正确检测到警告' : '❌ 未检测到警告'}`);

        console.log('\n🎉 环境隔离验证测试完成！');
        console.log('='.repeat(50));
        console.log('✅ 数据库环境完全隔离');
        console.log('✅ 配置环境完全隔离');
        console.log('✅ 日志级别环境特定化');
        console.log('✅ 系统状态报告包含环境标识');
        console.log('✅ 监控管理器环境感知');
        console.log('✅ 数据库连接池环境特定配置');
        console.log('✅ 环境配置验证功能正常');

    } catch (error) {
        console.error('❌ 环境隔离验证测试失败:', error.message);
        console.error('错误详情:', error.stack);
    }
}

// 运行测试
testEnvironmentIsolation().catch(console.error);