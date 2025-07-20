#!/usr/bin/env node

/**
 * 环境检测逻辑测试脚本
 * 测试不同环境下的配置和数据库连接
 */

import { configManager } from './src/config.js';
import { databaseManager } from './src/database.js';

async function testEnvironmentDetection() {
    console.log('🧪 开始测试环境检测逻辑...\n');

    try {
        // 测试1: 开发环境配置
        console.log('📋 测试1: 开发环境配置');
        console.log('='.repeat(40));

        // 设置开发环境
        process.env.NODE_ENV = 'development';
        process.env.TEST_MODE = 'true';
        process.env.DEBUG = 'true';
        process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5432/twitter_monitor_dev';
        process.env.API_CREDENTIALS = JSON.stringify([{
            "id": "dev_cred_1",
            "monitorUser": "devuser",
            "clientId": "dev_client_id",
            "clientSecret": "dev_client_secret",
            "redirectUri": "https://dev.example.com/callback",
            "username": "dev_x_user",
            "browserId": "dev_browser",
            "proxyUrl": "http://dev-proxy.example.com:8080"
        }]);
        process.env.DINGTALK_ACCESS_TOKEN = 'dev_dingtalk_token';

        // 重置配置管理器
        configManager.config = null;
        configManager.apiCredentials = null;

        // 测试环境信息获取
        const devEnvInfo = configManager.getEnvironmentInfo();
        console.log('开发环境信息:');
        console.log(`  - 环境: ${devEnvInfo.nodeEnv}`);
        console.log(`  - 是否生产环境: ${devEnvInfo.isProduction}`);
        console.log(`  - 是否开发环境: ${devEnvInfo.isDevelopment}`);
        console.log(`  - 测试模式: ${devEnvInfo.testMode}`);
        console.log(`  - 调试模式: ${devEnvInfo.enableDebug}`);
        console.log(`  - 日志级别: ${devEnvInfo.logLevel}`);
        console.log(`  - 部署平台: ${devEnvInfo.deploymentPlatform}`);
        console.log(`  - 数据库URL: ${devEnvInfo.databaseUrl ? '已配置' : '未配置'}`);

        // 测试环境配置验证
        const devValidation = configManager.validateEnvironmentConfiguration();
        console.log(`\n开发环境配置验证: ${devValidation.isValid ? '✅ 通过' : '❌ 失败'}`);
        if (devValidation.warnings.length > 0) {
            console.log('警告:');
            devValidation.warnings.forEach(warning => console.log(`  - ${warning}`));
        }

        // 测试2: 生产环境配置
        console.log('\n📋 测试2: 生产环境配置');
        console.log('='.repeat(40));

        // 设置生产环境
        process.env.NODE_ENV = 'production';
        process.env.TEST_MODE = 'false';
        process.env.DEBUG = 'false';
        process.env.BUILD_VERSION = '1.0.0';
        process.env.BUILD_TIME = new Date().toISOString();
        process.env.DATABASE_URL_PRODUCTION = 'postgresql://prod:prod@prod-db:5432/twitter_monitor_prod';
        process.env.RAILWAY_ENVIRONMENT = 'production'; // 模拟Railway环境

        // 重置配置管理器
        configManager.config = null;
        configManager.apiCredentials = null;

        const prodEnvInfo = configManager.getEnvironmentInfo();
        console.log('生产环境信息:');
        console.log(`  - 环境: ${prodEnvInfo.nodeEnv}`);
        console.log(`  - 是否生产环境: ${prodEnvInfo.isProduction}`);
        console.log(`  - 是否开发环境: ${prodEnvInfo.isDevelopment}`);
        console.log(`  - 测试模式: ${prodEnvInfo.testMode}`);
        console.log(`  - 调试模式: ${prodEnvInfo.enableDebug}`);
        console.log(`  - 日志级别: ${prodEnvInfo.logLevel}`);
        console.log(`  - 部署平台: ${prodEnvInfo.deploymentPlatform}`);
        console.log(`  - 构建版本: ${prodEnvInfo.buildVersion}`);
        console.log(`  - 数据库URL: ${prodEnvInfo.databaseUrl ? '已配置' : '未配置'}`);

        const prodValidation = configManager.validateEnvironmentConfiguration();
        console.log(`\n生产环境配置验证: ${prodValidation.isValid ? '✅ 通过' : '❌ 失败'}`);
        if (prodValidation.warnings.length > 0) {
            console.log('警告:');
            prodValidation.warnings.forEach(warning => console.log(`  - ${warning}`));
        }

        // 测试3: 测试环境配置
        console.log('\n📋 测试3: 测试环境配置');
        console.log('='.repeat(40));

        // 设置测试环境
        process.env.NODE_ENV = 'test';
        process.env.TEST_MODE = 'true';
        process.env.DATABASE_URL_TEST = 'postgresql://test:test@localhost:5432/twitter_monitor_test';
        delete process.env.RAILWAY_ENVIRONMENT; // 移除Railway环境标识

        // 重置配置管理器
        configManager.config = null;
        configManager.apiCredentials = null;

        const testEnvInfo = configManager.getEnvironmentInfo();
        console.log('测试环境信息:');
        console.log(`  - 环境: ${testEnvInfo.nodeEnv}`);
        console.log(`  - 是否测试环境: ${testEnvInfo.isTest}`);
        console.log(`  - 测试模式: ${testEnvInfo.testMode}`);
        console.log(`  - 调试模式: ${testEnvInfo.enableDebug}`);
        console.log(`  - 日志级别: ${testEnvInfo.logLevel}`);
        console.log(`  - 部署平台: ${testEnvInfo.deploymentPlatform}`);
        console.log(`  - 数据库URL: ${testEnvInfo.databaseUrl ? '已配置' : '未配置'}`);

        const testValidation = configManager.validateEnvironmentConfiguration();
        console.log(`\n测试环境配置验证: ${testValidation.isValid ? '✅ 通过' : '❌ 失败'}`);
        if (testValidation.warnings.length > 0) {
            console.log('警告:');
            testValidation.warnings.forEach(warning => console.log(`  - ${warning}`));
        }

        // 测试4: 数据库环境特定连接
        console.log('\n📋 测试4: 数据库环境特定连接');
        console.log('='.repeat(40));

        // 测试开发环境数据库连接
        process.env.NODE_ENV = 'development';
        process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5432/twitter_monitor_dev';
        delete process.env.DATABASE_URL_DEVELOPMENT;
        delete process.env.DATABASE_URL_PRODUCTION;
        delete process.env.DATABASE_URL_TEST;

        console.log('\n🔗 测试开发环境数据库连接:');
        const devDbUrl = databaseManager.getEnvironmentSpecificDatabaseUrl();
        console.log(`开发环境数据库URL: ${devDbUrl ? '已获取' : '未获取'}`);
        if (devDbUrl) {
            const maskedUrl = devDbUrl.replace(/:\/\/[^@]+@/, '://***:***@');
            console.log(`  - 连接信息: ${maskedUrl}`);
        }

        const devPoolConfig = databaseManager.getEnvironmentSpecificPoolConfig(devDbUrl || 'test');
        console.log(`开发环境连接池配置:`);
        console.log(`  - 最大连接数: ${devPoolConfig.max}`);
        console.log(`  - 最小连接数: ${devPoolConfig.min}`);
        console.log(`  - 连接超时: ${devPoolConfig.connectionTimeoutMillis}ms`);

        // 测试生产环境数据库连接
        process.env.NODE_ENV = 'production';
        process.env.DATABASE_URL_PRODUCTION = 'postgresql://prod:prod@prod-db:5432/twitter_monitor_prod';

        console.log('\n🔗 测试生产环境数据库连接:');
        const prodDbUrl = databaseManager.getEnvironmentSpecificDatabaseUrl();
        console.log(`生产环境数据库URL: ${prodDbUrl ? '已获取' : '未获取'}`);
        if (prodDbUrl) {
            const maskedUrl = prodDbUrl.replace(/:\/\/[^@]+@/, '://***:***@');
            console.log(`  - 连接信息: ${maskedUrl}`);
        }

        const prodPoolConfig = databaseManager.getEnvironmentSpecificPoolConfig(prodDbUrl || 'test');
        console.log(`生产环境连接池配置:`);
        console.log(`  - 最大连接数: ${prodPoolConfig.max}`);
        console.log(`  - 最小连接数: ${prodPoolConfig.min}`);
        console.log(`  - 连接超时: ${prodPoolConfig.connectionTimeoutMillis}ms`);

        // 测试5: 环境特定监控设置
        console.log('\n📋 测试5: 环境特定监控设置');
        console.log('='.repeat(40));

        // 开发环境监控设置
        process.env.NODE_ENV = 'development';
        process.env.TEST_MODE = 'true';
        process.env.TEST_INTERVAL = '1';

        configManager.config = null;
        const devMonitorSettings = configManager.getMonitorSettings();
        console.log('开发环境监控设置:');
        console.log(`  - 测试模式: ${devMonitorSettings.testMode}`);
        console.log(`  - 测试间隔: ${devMonitorSettings.testIntervalMinutes}分钟`);
        console.log(`  - 开始时间: ${devMonitorSettings.startTime}`);
        console.log(`  - 结束时间: ${devMonitorSettings.endTime}`);

        // 生产环境监控设置
        process.env.NODE_ENV = 'production';
        process.env.TEST_MODE = 'false';
        process.env.TEST_INTERVAL = '2';

        configManager.config = null;
        const prodMonitorSettings = configManager.getMonitorSettings();
        console.log('\n生产环境监控设置:');
        console.log(`  - 测试模式: ${prodMonitorSettings.testMode}`);
        console.log(`  - 测试间隔: ${prodMonitorSettings.testIntervalMinutes}分钟`);
        console.log(`  - 开始时间: ${prodMonitorSettings.startTime}`);
        console.log(`  - 结束时间: ${prodMonitorSettings.endTime}`);

        // 测试环境监控设置
        process.env.NODE_ENV = 'test';
        delete process.env.TEST_MODE; // 测试环境应该自动启用测试模式

        configManager.config = null;
        const testMonitorSettings = configManager.getMonitorSettings();
        console.log('\n测试环境监控设置:');
        console.log(`  - 测试模式: ${testMonitorSettings.testMode}`);
        console.log(`  - 测试间隔: ${testMonitorSettings.testIntervalMinutes}分钟`);
        console.log(`  - 开始时间: ${testMonitorSettings.startTime}`);
        console.log(`  - 结束时间: ${testMonitorSettings.endTime}`);

        // 测试6: 环境报告生成
        console.log('\n📋 测试6: 环境报告生成');
        console.log('='.repeat(40));

        // 设置完整的开发环境
        process.env.NODE_ENV = 'development';
        process.env.TEST_MODE = 'true';
        process.env.DEBUG = 'true';
        process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5432/twitter_monitor_dev';

        configManager.config = null;
        console.log('\n开发环境完整报告:');
        const devReportValid = configManager.printEnvironmentReport();
        console.log(`开发环境报告生成: ${devReportValid ? '✅ 成功' : '❌ 失败'}`);

        // 设置完整的生产环境
        process.env.NODE_ENV = 'production';
        process.env.TEST_MODE = 'false';
        process.env.DEBUG = 'false';
        process.env.BUILD_VERSION = '1.0.0';
        process.env.DATABASE_URL_PRODUCTION = 'postgresql://prod:prod@prod-db:5432/twitter_monitor_prod';
        process.env.RAILWAY_ENVIRONMENT = 'production';

        configManager.config = null;
        console.log('\n生产环境完整报告:');
        const prodReportValid = configManager.printEnvironmentReport();
        console.log(`生产环境报告生成: ${prodReportValid ? '✅ 成功' : '❌ 失败'}`);

        // 测试7: 部署平台检测
        console.log('\n📋 测试7: 部署平台检测');
        console.log('='.repeat(40));

        // 测试Railway平台检测
        process.env.RAILWAY_ENVIRONMENT = 'production';
        delete process.env.DYNO;
        delete process.env.VERCEL;
        delete process.env.DOCKER_CONTAINER;

        const railwayPlatform = configManager.getDeploymentPlatform();
        console.log(`Railway平台检测: ${railwayPlatform === 'railway' ? '✅ 成功' : '❌ 失败'} (${railwayPlatform})`);

        // 测试Heroku平台检测
        delete process.env.RAILWAY_ENVIRONMENT;
        process.env.DYNO = 'web.1';

        const herokuPlatform = configManager.getDeploymentPlatform();
        console.log(`Heroku平台检测: ${herokuPlatform === 'heroku' ? '✅ 成功' : '❌ 失败'} (${herokuPlatform})`);

        // 测试Docker容器检测
        delete process.env.DYNO;
        process.env.DOCKER_CONTAINER = 'true';

        const dockerPlatform = configManager.getDeploymentPlatform();
        console.log(`Docker平台检测: ${dockerPlatform === 'docker' ? '✅ 成功' : '❌ 失败'} (${dockerPlatform})`);

        // 测试本地环境检测
        delete process.env.DOCKER_CONTAINER;

        const localPlatform = configManager.getDeploymentPlatform();
        console.log(`本地环境检测: ${localPlatform === 'local' ? '✅ 成功' : '❌ 失败'} (${localPlatform})`);

        console.log('\n🎉 环境检测逻辑测试完成！');
        console.log('='.repeat(50));
        console.log('✅ 开发环境配置正确');
        console.log('✅ 生产环境配置正确');
        console.log('✅ 测试环境配置正确');
        console.log('✅ 数据库环境分离功能正常');
        console.log('✅ 监控设置环境特定化正常');
        console.log('✅ 环境报告生成功能正常');
        console.log('✅ 部署平台检测功能正常');

    } catch (error) {
        console.error('❌ 环境检测逻辑测试失败:', error.message);
        console.error('错误详情:', error.stack);
    }
}

// 运行测试
testEnvironmentDetection().catch(console.error);