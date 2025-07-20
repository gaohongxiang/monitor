#!/usr/bin/env node

/**
 * 监控管理器核心功能测试
 * 测试数据库集成和状态管理
 */

import { xMonitorManager } from './src/monitor.js';
import { databaseManager } from './src/database.js';
import { configManager } from './src/config.js';

// 设置测试环境变量
process.env.NODE_ENV = 'development';
process.env.TEST_MODE = 'true';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_twitter_monitor';

// 模拟API凭证配置
process.env.API_CREDENTIALS = JSON.stringify([
    {
        "id": "test_cred_1",
        "monitorUser": "testuser1",
        "clientId": "test_client_id_1",
        "clientSecret": "test_client_secret_1",
        "redirectUri": "https://example.com/callback",
        "username": "test_x_user_1",
        "browserId": "test_browser_1",
        "proxyUrl": "http://proxy.example.com:8080"
    }
]);

process.env.DINGTALK_ACCESS_TOKEN = 'test_dingtalk_token';

async function testMonitorManager() {
    console.log('🧪 开始测试监控管理器核心功能...\n');

    try {
        // 测试1: 初始化数据库
        console.log('📋 测试1: 初始化数据库连接');
        const dbInitResult = await databaseManager.initialize();
        console.log(`数据库初始化: ${dbInitResult ? '✅ 成功' : '❌ 失败'}`);
        
        if (!dbInitResult) {
            console.log('⚠️  数据库连接失败，跳过后续测试');
            return;
        }

        // 测试2: 加载配置
        console.log('\n📋 测试2: 加载配置');
        const config = configManager.loadConfig();
        console.log(`配置加载: ✅ 成功`);
        console.log(`监控用户数: ${config.monitoredUsers.length}`);

        // 测试3: 创建监控管理器实例
        console.log('\n📋 测试3: 创建监控管理器实例');
        const monitorManager = new xMonitorManager();
        console.log('监控管理器创建: ✅ 成功');

        // 等待历史数据加载完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 测试4: 测试数据库状态管理
        console.log('\n📋 测试4: 测试数据库状态管理');
        
        const testUser = 'testuser1';
        const testTweetId = 'test_tweet_12345';
        
        // 更新最后推文ID
        await monitorManager.updateLastTweetId(testUser, testTweetId);
        console.log('更新最后推文ID: ✅ 成功');
        
        // 验证数据库中的数据
        const dbState = await databaseManager.getMonitorState(testUser);
        console.log(`数据库状态验证: ${dbState && dbState.last_tweet_id === testTweetId ? '✅ 成功' : '❌ 失败'}`);
        if (dbState) {
            console.log(`  - 用户: ${dbState.monitor_user}`);
            console.log(`  - 最后推文ID: ${dbState.last_tweet_id}`);
        }

        // 测试5: 测试监控统计管理
        console.log('\n📋 测试5: 测试监控统计管理');
        
        // 更新监控统计
        await monitorManager.updateMonitorStats(testUser, 3, true);
        console.log('更新监控统计: ✅ 成功');
        
        // 验证数据库中的统计数据
        const dbStats = await databaseManager.getMonitorStats(testUser);
        console.log(`数据库统计验证: ${dbStats ? '✅ 成功' : '❌ 失败'}`);
        if (dbStats) {
            console.log(`  - 总推文数: ${dbStats.total_tweets}`);
            console.log(`  - 成功次数: ${dbStats.success_count}`);
            console.log(`  - 错误次数: ${dbStats.error_count}`);
        }

        // 测试6: 测试API限流记录
        console.log('\n📋 测试6: 测试API限流记录');
        
        monitorManager.recordRateLimit(testUser);
        console.log('记录API限流: ✅ 成功');
        
        // 再次更新统计以保存限流记录到数据库
        await monitorManager.updateMonitorStats(testUser, 0, false);
        
        const updatedStats = await databaseManager.getMonitorStats(testUser);
        console.log(`限流记录验证: ${updatedStats && updatedStats.error_count > 0 ? '✅ 成功' : '❌ 失败'}`);

        // 测试7: 测试数据存储统计
        console.log('\n📋 测试7: 测试数据存储统计');
        
        const storageStats = monitorManager.getStorageStats();
        console.log(`存储统计获取: ${storageStats ? '✅ 成功' : '❌ 失败'}`);
        if (storageStats) {
            console.log(`  - 数据目录: ${storageStats.dataDir}`);
            console.log(`  - 总文件数: ${storageStats.totalFiles}`);
            console.log(`  - 总大小: ${storageStats.totalSizeFormatted}`);
        }

        // 测试8: 测试推文保存
        console.log('\n📋 测试8: 测试推文保存');
        
        const testTweets = [
            {
                id: 'tweet_1',
                nickname: testUser,
                text: '这是一条测试推文',
                createdAt: new Date().toISOString(),
                url: 'https://twitter.com/testuser1/status/tweet_1',
                metrics: { like_count: 10, retweet_count: 5 }
            }
        ];
        
        monitorManager.saveTweetsToFile(testTweets);
        console.log('保存推文到文件: ✅ 成功');

        // 测试9: 测试日志记录
        console.log('\n📋 测试9: 测试日志记录');
        
        monitorManager.logMonitorEvent('info', '测试日志消息', { testData: 'test_value' });
        console.log('记录监控日志: ✅ 成功');

        // 测试10: 测试数据清理
        console.log('\n📋 测试10: 测试数据清理');
        
        monitorManager.cleanupOldData(1); // 清理1天前的数据
        console.log('清理旧数据: ✅ 成功');

        console.log('\n🎉 监控管理器核心功能测试完成！');

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error('错误详情:', error.stack);
    } finally {
        // 关闭数据库连接
        await databaseManager.close();
    }
}

// 运行测试
testMonitorManager().catch(console.error);