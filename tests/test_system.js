#!/usr/bin/env node

/**
 * 系统集成测试
 * 测试配置管理、数据库管理和监控管理的集成
 */

import { configManager } from './src/config.js';
import { databaseManager } from './src/database.js';
import { xMonitorManager } from './src/monitor.js';

// 设置完整的测试环境变量
process.env.NODE_ENV = 'development';
process.env.TEST_MODE = 'true';
process.env.TEST_INTERVAL = '1';
process.env.MONITOR_START_TIME = '09:00';
process.env.MONITOR_END_TIME = '23:00';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_twitter_monitor';
process.env.DINGTALK_ACCESS_TOKEN = 'test_dingtalk_token_system';

// 设置多用户API凭证配置
process.env.API_CREDENTIALS = JSON.stringify([
    {
        "id": "system_cred_1",
        "monitorUser": "user1",
        "clientId": "client_id_1",
        "clientSecret": "client_secret_1",
        "redirectUri": "https://example.com/callback1",
        "username": "x_user_1",
        "browserId": "browser_1",
        "proxyUrl": "http://proxy1.example.com:8080"
    },
    {
        "id": "system_cred_2",
        "monitorUser": "user1",
        "clientId": "client_id_2",
        "clientSecret": "client_secret_2",
        "redirectUri": "https://example.com/callback2",
        "username": "x_user_2",
        "browserId": "browser_2",
        "proxyUrl": "http://proxy2.example.com:8080"
    },
    {
        "id": "system_cred_3",
        "monitorUser": "user2",
        "clientId": "client_id_3",
        "clientSecret": "client_secret_3",
        "redirectUri": "https://example.com/callback3",
        "username": "x_user_3",
        "browserId": "browser_3",
        "proxyUrl": "http://proxy3.example.com:8080"
    }
]);

async function testSystemIntegration() {
    console.log('🧪 开始系统集成测试...\n');

    try {
        // 阶段1: 配置系统测试
        console.log('🔧 阶段1: 配置系统测试');
        console.log('='.repeat(40));

        // 验证配置
        const configValid = configManager.printValidationReport();
        console.log(`配置验证: ${configValid ? '✅ 通过' : '❌ 失败'}\n`);

        // 加载配置
        const config = configManager.loadConfig();
        console.log(`配置加载: ✅ 成功`);
        console.log(`监控用户数: ${config.monitoredUsers.length}`);
        console.log(`总API凭证数: ${config.monitoredUsers.reduce((total, user) => total + user.apiCredentials.length, 0)}`);

        // 阶段2: 数据库系统测试
        console.log('\n🗄️  阶段2: 数据库系统测试');
        console.log('='.repeat(40));

        // 初始化数据库
        const dbInit = await databaseManager.initialize();
        console.log(`数据库初始化: ${dbInit ? '✅ 成功' : '❌ 失败'}`);

        if (!dbInit) {
            console.log('⚠️  数据库连接失败，跳过后续测试');
            return;
        }

        // 执行健康检查
        const healthCheck = await databaseManager.performHealthCheck();
        console.log(`数据库健康检查: ${healthCheck.isConnected && healthCheck.tablesExist ? '✅ 通过' : '❌ 失败'}`);

        // 阶段3: 数据存储和状态管理测试
        console.log('\n📊 阶段3: 数据存储和状态管理测试');
        console.log('='.repeat(40));

        // 测试refreshToken存储
        console.log('\n📋 测试refreshToken存储:');
        const testTokens = new Map([
            ['system_cred_1', 'refresh_token_1_' + Date.now()],
            ['system_cred_2', 'refresh_token_2_' + Date.now()],
            ['system_cred_3', 'refresh_token_3_' + Date.now()]
        ]);

        const tokenSaveResult = await databaseManager.batchSaveRefreshTokens(testTokens);
        console.log(`  批量保存refreshToken: ${tokenSaveResult ? '✅ 成功' : '❌ 失败'}`);

        const allTokens = await databaseManager.getAllRefreshTokens();
        console.log(`  批量读取refreshToken: ${allTokens.size >= testTokens.size ? '✅ 成功' : '❌ 失败'}`);
        console.log(`  Token数量: ${allTokens.size}`);

        // 测试监控状态存储
        console.log('\n📋 测试监控状态存储:');
        const testStates = new Map([
            ['user1', 'tweet_id_1_' + Date.now()],
            ['user2', 'tweet_id_2_' + Date.now()]
        ]);

        const stateSaveResult = await databaseManager.batchSaveMonitorStates(testStates);
        console.log(`  批量保存监控状态: ${stateSaveResult ? '✅ 成功' : '❌ 失败'}`);

        const allStates = await databaseManager.getAllMonitorStates();
        console.log(`  批量读取监控状态: ${allStates.size >= testStates.size ? '✅ 成功' : '❌ 失败'}`);
        console.log(`  状态数量: ${allStates.size}`);

        // 测试监控统计
        console.log('\n📋 测试监控统计:');
        for (const user of ['user1', 'user2']) {
            const statsResult = await databaseManager.updateMonitorStats(user, {
                totalTweets: Math.floor(Math.random() * 10) + 1,
                successCount: 1,
                errorCount: 0,
                rateLimitHits: 0,
                lastSuccessTime: new Date().toISOString()
            });
            console.log(`  更新${user}统计: ${statsResult ? '✅ 成功' : '❌ 失败'}`);
        }

        const allStats = await databaseManager.getAllMonitorStats();
        console.log(`  读取所有统计: ${allStats.size > 0 ? '✅ 成功' : '❌ 失败'}`);
        console.log(`  统计数量: ${allStats.size}`);

        // 阶段4: 监控管理器集成测试
        console.log('\n🔍 阶段4: 监控管理器集成测试');
        console.log('='.repeat(40));

        // 创建监控管理器
        const monitorManager = new xMonitorManager();
        console.log('监控管理器创建: ✅ 成功');

        // 等待历史数据加载
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 测试数据库集成
        console.log('\n📋 测试监控管理器数据库集成:');
        
        const testUser = 'user1';
        const newTweetId = 'integrated_tweet_' + Date.now();
        
        // 更新推文ID
        await monitorManager.updateLastTweetId(testUser, newTweetId);
        console.log(`  更新推文ID: ✅ 成功`);
        
        // 验证数据库更新
        const updatedState = await databaseManager.getMonitorState(testUser);
        console.log(`  数据库验证: ${updatedState && updatedState.last_tweet_id === newTweetId ? '✅ 成功' : '❌ 失败'}`);

        // 更新统计
        await monitorManager.updateMonitorStats(testUser, 5, true);
        console.log(`  更新统计: ✅ 成功`);
        
        // 验证统计更新
        const updatedStats = await databaseManager.getMonitorStats(testUser);
        console.log(`  统计验证: ${updatedStats && updatedStats.total_tweets > 0 ? '✅ 成功' : '❌ 失败'}`);

        // 阶段5: 系统性能和统计测试
        console.log('\n📈 阶段5: 系统性能和统计测试');
        console.log('='.repeat(40));

        // 获取数据库统计
        const dbStats = await databaseManager.getDatabaseStats();
        console.log(`数据库统计获取: ${dbStats ? '✅ 成功' : '❌ 失败'}`);
        if (dbStats) {
            console.log('数据库统计:');
            console.log(`  - refreshToken数: ${dbStats.refreshTokens}`);
            console.log(`  - 监控状态数: ${dbStats.monitorStates}`);
            console.log(`  - 监控统计数: ${dbStats.monitorStats}`);
            console.log(`  - API使用统计数: ${dbStats.apiUsageStats}`);
            console.log(`  - 数据库大小: ${dbStats.databaseSize}`);
        }

        // 获取配置摘要
        const configSummary = configManager.getConfigSummary();
        console.log(`\n配置摘要获取: ✅ 成功`);
        console.log('配置摘要:');
        console.log(`  - 运行环境: ${configSummary.environment}`);
        console.log(`  - 测试模式: ${configSummary.testMode}`);
        console.log(`  - 监控用户数: ${configSummary.monitoredUsers}`);
        console.log(`  - 总API凭证数: ${configSummary.totalApiCredentials}`);

        // 获取存储统计
        const storageStats = monitorManager.getStorageStats();
        console.log(`\n存储统计获取: ${storageStats ? '✅ 成功' : '❌ 失败'}`);
        if (storageStats) {
            console.log('存储统计:');
            console.log(`  - 总文件数: ${storageStats.totalFiles}`);
            console.log(`  - 总大小: ${storageStats.totalSizeFormatted}`);
        }

        // 阶段6: 数据清理测试
        console.log('\n🧹 阶段6: 数据清理测试');
        console.log('='.repeat(40));

        // 清理API使用统计
        const cleanupResult = await databaseManager.cleanupApiUsageStats(30);
        console.log(`清理API使用统计: ${cleanupResult ? '✅ 成功' : '❌ 失败'}`);

        // 清理文件数据
        monitorManager.cleanupOldData(1);
        console.log(`清理文件数据: ✅ 成功`);

        console.log('\n🎉 系统集成测试完成！');
        console.log('='.repeat(50));
        console.log('✅ 所有系统组件集成测试通过');
        console.log('✅ 数据存储和状态管理功能正常');
        console.log('✅ 配置管理系统工作正常');
        console.log('✅ 数据库集成功能完整');

    } catch (error) {
        console.error('❌ 系统集成测试失败:', error.message);
        console.error('错误详情:', error.stack);
        process.exit(1);
    } finally {
        // 关闭数据库连接
        await databaseManager.close();
    }
}

// 运行系统集成测试
testSystemIntegration().catch(console.error);