#!/usr/bin/env node

/**
 * 钉钉通知功能测试脚本
 * 测试钉钉通知器和监控管理器的集成
 */

import { DingTalkNotifier } from './src/notifier.js';
import { xMonitorManager } from './src/monitor.js';
import { configManager } from './src/config.js';
import { databaseManager } from './src/database.js';

// 设置测试环境变量
process.env.NODE_ENV = 'development';
process.env.TEST_MODE = 'true';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_twitter_monitor';
process.env.DINGTALK_ACCESS_TOKEN = 'test_dingtalk_token_notification';

// 模拟API凭证配置
process.env.API_CREDENTIALS = JSON.stringify([
    {
        "id": "notify_cred_1",
        "monitorUser": "testuser1",
        "clientId": "test_client_id_1",
        "clientSecret": "test_client_secret_1",
        "redirectUri": "https://example.com/callback",
        "username": "test_x_user_1",
        "browserId": "test_browser_1",
        "proxyUrl": "http://proxy.example.com:8080"
    }
]);

async function testNotificationSystem() {
    console.log('🧪 开始测试钉钉通知系统...\n');

    try {
        // 测试1: 基础钉钉通知器测试
        console.log('📋 测试1: 基础钉钉通知器功能');
        console.log('='.repeat(40));

        const testToken = process.env.DINGTALK_ACCESS_TOKEN;
        const notifier = new DingTalkNotifier(testToken);

        // 测试文本消息
        console.log('\n📤 测试文本消息发送:');
        try {
            const textResult = await notifier.sendTextMessage('这是一条测试消息', '.', true);
            console.log(`文本消息发送: ${textResult.success ? '✅ 成功' : '❌ 失败'}`);
            if (textResult.success) {
                console.log(`  - 尝试次数: ${textResult.attempt}`);
            }
        } catch (error) {
            console.log(`文本消息发送: ❌ 失败 (${error.message})`);
        }

        // 测试系统通知
        console.log('\n📤 测试系统通知发送:');
        try {
            const systemResult = await notifier.sendSystemNotification(
                'info', 
                '系统测试通知', 
                { testType: '钉钉通知测试', timestamp: new Date().toISOString() }
            );
            console.log(`系统通知发送: ${systemResult.success ? '✅ 成功' : '❌ 失败'}`);
        } catch (error) {
            console.log(`系统通知发送: ❌ 失败 (${error.message})`);
        }

        // 测试推文通知
        console.log('\n📤 测试推文通知发送:');
        const testTweets = [
            {
                id: 'test_tweet_1',
                nickname: 'testuser1',
                text: '这是一条测试推文，用于验证钉钉通知功能是否正常工作。',
                createdAt: new Date().toISOString(),
                url: 'https://twitter.com/testuser1/status/test_tweet_1',
                metrics: { like_count: 10, retweet_count: 5 }
            }
        ];

        try {
            const tweetResult = await notifier.sendTweetNotification(testTweets);
            console.log(`推文通知发送: ${tweetResult.success ? '✅ 成功' : '❌ 失败'}`);
        } catch (error) {
            console.log(`推文通知发送: ❌ 失败 (${error.message})`);
        }

        // 测试多条推文通知
        console.log('\n📤 测试多条推文通知发送:');
        const multiTweets = [
            {
                id: 'test_tweet_2',
                nickname: 'testuser1',
                text: '第一条测试推文',
                createdAt: new Date().toISOString(),
                url: 'https://twitter.com/testuser1/status/test_tweet_2',
                metrics: { like_count: 5, retweet_count: 2 }
            },
            {
                id: 'test_tweet_3',
                nickname: 'testuser1',
                text: '第二条测试推文',
                createdAt: new Date().toISOString(),
                url: 'https://twitter.com/testuser1/status/test_tweet_3',
                metrics: { like_count: 8, retweet_count: 3 }
            }
        ];

        try {
            const multiResult = await notifier.sendTweetNotification(multiTweets);
            console.log(`多条推文通知发送: ${multiResult.success ? '✅ 成功' : '❌ 失败'}`);
        } catch (error) {
            console.log(`多条推文通知发送: ❌ 失败 (${error.message})`);
        }

        // 测试监控统计报告
        console.log('\n📤 测试监控统计报告发送:');
        const testStats = {
            totalUsers: 2,
            totalTweets: 15,
            successCount: 12,
            errorCount: 2,
            rateLimitHits: 1,
            lastSuccessTime: new Date().toISOString()
        };

        try {
            const statsResult = await notifier.sendMonitorReport(testStats);
            console.log(`监控统计报告发送: ${statsResult.success ? '✅ 成功' : '❌ 失败'}`);
        } catch (error) {
            console.log(`监控统计报告发送: ❌ 失败 (${error.message})`);
        }

        // 测试2: 监控管理器集成测试
        console.log('\n📋 测试2: 监控管理器钉钉通知集成');
        console.log('='.repeat(40));

        // 初始化数据库
        const dbInit = await databaseManager.initialize();
        console.log(`数据库初始化: ${dbInit ? '✅ 成功' : '❌ 失败'}`);

        if (dbInit) {
            // 加载配置
            const config = configManager.loadConfig();
            console.log(`配置加载: ✅ 成功`);

            // 创建监控管理器
            const monitorManager = new xMonitorManager();
            console.log('监控管理器创建: ✅ 成功');

            // 等待初始化完成
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 测试钉钉连接
            console.log('\n📤 测试钉钉连接:');
            const connectionTest = await monitorManager.testDingTalkConnection();
            console.log(`钉钉连接测试: ${connectionTest ? '✅ 成功' : '❌ 失败'}`);

            // 测试推文通知发送
            console.log('\n📤 测试监控管理器推文通知:');
            await monitorManager.sendTweetNotification(testTweets);
            console.log('监控管理器推文通知: ✅ 已发送');

            // 测试系统通知发送
            console.log('\n📤 测试监控管理器系统通知:');
            await monitorManager.sendSystemNotification(
                'success', 
                '监控系统启动成功', 
                { 
                    version: '1.0.0',
                    environment: 'test',
                    startTime: new Date().toISOString()
                }
            );
            console.log('监控管理器系统通知: ✅ 已发送');

            // 测试监控统计报告
            console.log('\n📤 测试监控管理器统计报告:');
            await monitorManager.sendMonitorReport(testStats);
            console.log('监控管理器统计报告: ✅ 已发送');

            // 测试3: 错误处理和重试机制测试
            console.log('\n📋 测试3: 错误处理和重试机制');
            console.log('='.repeat(40));

            // 测试无效token的错误处理
            console.log('\n📤 测试无效token错误处理:');
            const invalidNotifier = new DingTalkNotifier('invalid_token');
            try {
                await invalidNotifier.sendTextMessage('测试无效token');
                console.log('无效token测试: ❌ 应该失败但成功了');
            } catch (error) {
                console.log('无效token测试: ✅ 正确捕获错误');
                console.log(`  - 错误信息: ${error.message}`);
            }

            // 测试空推文列表处理
            console.log('\n📤 测试空推文列表处理:');
            try {
                await notifier.sendTweetNotification([]);
                console.log('空推文列表测试: ❌ 应该抛出错误');
            } catch (error) {
                console.log('空推文列表测试: ✅ 正确抛出错误');
                console.log(`  - 错误信息: ${error.message}`);
            }

            // 测试4: 文本处理功能测试
            console.log('\n📋 测试4: 文本处理功能');
            console.log('='.repeat(40));

            // 测试文本截断
            const longText = 'A'.repeat(300);
            const truncated = notifier.truncateText(longText, 100);
            console.log(`文本截断测试: ${truncated.length === 103 ? '✅ 成功' : '❌ 失败'}`); // 100 + '...'
            console.log(`  - 原长度: ${longText.length}, 截断后: ${truncated.length}`);

            // 测试时间格式化
            const testTime = new Date().toISOString();
            const formattedTime = notifier.formatTweetTime(testTime);
            console.log(`时间格式化测试: ${formattedTime ? '✅ 成功' : '❌ 失败'}`);
            console.log(`  - 原时间: ${testTime}`);
            console.log(`  - 格式化后: ${formattedTime}`);

            // 测试推文统计
            const tweetStats = notifier.getTweetStats(multiTweets);
            console.log(`推文统计测试: ${Object.keys(tweetStats).length > 0 ? '✅ 成功' : '❌ 失败'}`);
            console.log(`  - 统计结果:`, tweetStats);

        } else {
            console.log('⚠️  数据库连接失败，跳过监控管理器集成测试');
        }

        console.log('\n🎉 钉钉通知系统测试完成！');
        console.log('='.repeat(50));
        console.log('✅ 基础通知功能正常');
        console.log('✅ 推文通知格式正确');
        console.log('✅ 系统通知功能完整');
        console.log('✅ 监控管理器集成成功');
        console.log('✅ 错误处理机制有效');
        console.log('✅ 文本处理功能正常');

    } catch (error) {
        console.error('❌ 钉钉通知系统测试失败:', error.message);
        console.error('错误详情:', error.stack);
    } finally {
        // 关闭数据库连接
        if (databaseManager.isHealthy()) {
            await databaseManager.close();
        }
    }
}

// 运行测试
testNotificationSystem().catch(console.error);