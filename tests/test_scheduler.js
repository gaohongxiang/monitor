import dotenv from 'dotenv';
import { scheduleManager } from './src/scheduler.js';
import { configManager } from './src/config.js';

// 加载环境变量
dotenv.config();

/**
 * 调度器功能测试
 */
async function testScheduler() {
    console.log('🧪 开始测试调度器功能...\n');

    // 模拟监控回调函数
    const mockMonitorCallback = async (nickname, credentialIndex) => {
        console.log(`📊 执行监控 [用户: ${nickname}, 凭证索引: ${credentialIndex}]`);
        
        // 模拟随机成功/失败
        if (Math.random() < 0.8) {
            console.log(`✅ 监控成功 [用户: ${nickname}]`);
        } else {
            throw new Error(`模拟监控失败 [用户: ${nickname}]`);
        }
    };

    try {
        // 1. 测试调度时间计算
        console.log('1️⃣ 测试调度时间计算:');
        const scheduleTimes = scheduleManager.calculateScheduleTimes(3);
        console.log('计算的调度时间点:', scheduleTimes);
        console.log('');

        // 2. 测试获取用户昵称
        console.log('2️⃣ 测试获取监控用户:');
        const userNicknames = configManager.getMonitoredUserNicknames();
        console.log('监控用户列表:', userNicknames);
        console.log('');

        if (userNicknames.length === 0) {
            console.log('⚠️ 没有配置监控用户，跳过后续测试');
            return;
        }

        // 3. 测试创建单个用户调度
        console.log('3️⃣ 测试创建用户调度:');
        const testUser = userNicknames[0];
        const success = scheduleManager.createUserSchedule(testUser, mockMonitorCallback);
        console.log(`创建用户 ${testUser} 调度结果:`, success);
        console.log('');

        // 4. 测试获取调度状态
        console.log('4️⃣ 测试获取调度状态:');
        const status = scheduleManager.getScheduleStatus();
        console.log('调度状态:', JSON.stringify(status, null, 2));
        console.log('');

        // 5. 测试获取下次执行时间
        console.log('5️⃣ 测试获取下次执行时间:');
        const nextTimes = scheduleManager.getNextExecutionTimes(testUser);
        console.log('下次执行时间:', JSON.stringify(nextTimes, null, 2));
        console.log('');

        // 6. 测试手动触发
        console.log('6️⃣ 测试手动触发监控:');
        await scheduleManager.manualTrigger(testUser, 0, mockMonitorCallback);
        console.log('');

        // 7. 测试任务统计
        console.log('7️⃣ 测试任务统计:');
        const stats = scheduleManager.getTaskStats(testUser);
        console.log('任务统计:', JSON.stringify(stats, null, 2));
        console.log('');

        // 8. 测试启动和停止调度
        console.log('8️⃣ 测试启动调度:');
        const startResult = scheduleManager.startAllSchedules();
        console.log('启动结果:', startResult);
        
        // 等待几秒钟
        console.log('等待 3 秒钟...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('9️⃣ 测试停止调度:');
        const stopResult = scheduleManager.stopAllSchedules();
        console.log('停止结果:', stopResult);
        console.log('');

        console.log('✅ 调度器测试完成！');

    } catch (error) {
        console.error('❌ 调度器测试失败:', error);
    }
}

// 运行测试
testScheduler();