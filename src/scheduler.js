import cron from 'node-cron';
import { configManager } from './config.js';
import { TimeUtils } from './timeUtils.js';

/**
 * 时间调度管理器
 * 负责计算监控时间点并创建定时任务
 * 支持任务的启动、停止、状态查询和错误处理重试机制
 */
export class ScheduleManager {
    constructor() {
        this.scheduledTasks = new Map(); // 存储所有定时任务
        this.userSchedules = new Map(); // 存储用户调度信息
        this.taskStats = new Map(); // 存储任务执行统计
        this.isRunning = false;
        this.retryConfig = {
            maxRetries: 3,
            retryDelay: 5000, // 5秒
            backoffMultiplier: 2
        };

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
     * 格式化UTC时间为字符串
     * @param {Date} date - 日期对象
     * @returns {string} 格式化的时间字符串
     */
    formatUTCTime(date = null) {
        const targetDate = date || this.getCurrentUTCTime();
        return targetDate.toISOString();
    }

    /**
     * 计算用户的监控时间点
     * @param {number} apiCredentialCount - API凭证数量
     * @returns {Array} 时间点列表
     */
    calculateScheduleTimes(apiCredentialCount) {
        // 从配置管理器获取监控设置
        const config = configManager.loadConfig();
        const settings = config.monitorSettings || {};

        // 解析时间字符串 "HH:MM"
        const parseTime = (timeStr) => {
            const [hour, minute] = (timeStr || "09:00").split(':').map(Number);
            return { hour, minute };
        };

        const startTime = parseTime(settings.startTime || "09:00");
        const endTime = parseTime(settings.endTime || "23:00");
        const testMode = settings.testMode || false;
        const testIntervalMinutes = settings.testIntervalMinutes || 1;

        const scheduleTimes = [];

        // 检查运行环境
        const isProduction = process.env.NODE_ENV === 'production';

        if (testMode || !isProduction) {
            // 开发/测试模式：模拟生产环境的时间点分配，但压缩到几分钟内执行
            console.log(`🧪 ${testMode ? '测试' : '开发'}模式启用 - 模拟生产环境时间点分配`);

            // 先计算生产环境的时间点分配逻辑
            const totalRequests = apiCredentialCount * 3; // 每个API每天3次
            console.log(`模拟生产环境：${apiCredentialCount} 个API凭证，共 ${totalRequests} 个监控时间点`);

            // 将时间点压缩到开发环境的几分钟内
            const utcTime = this.getCurrentUTCTime();
            const baseTime = new Date(utcTime.getTime() + 10000); // 10秒后开始

            // 生成压缩的时间点：每个时间点间隔testInterval分钟
            for (let i = 0; i < totalRequests; i++) {
                const executeTime = new Date(baseTime.getTime() + (i * testIntervalMinutes * 60 * 1000));
                scheduleTimes.push({
                    hour: executeTime.getUTCHours(),
                    minute: executeTime.getUTCMinutes(),
                    second: executeTime.getUTCSeconds(),
                    credentialIndex: i % apiCredentialCount, // 轮换使用API凭证
                    isDevelopment: true // 标记为开发环境任务
                });
            }

            console.log(`开发环境时间点分配：从 ${baseTime.toISOString()} 开始，每${testIntervalMinutes}分钟一个时间点`);
            return scheduleTimes;
        }

        // 固定开始和结束时间，中间均匀分配剩余的请求
        console.log(`🏭 生产模式 - 监控时间: ${settings.startTime} - ${settings.endTime}`);

        const dailyRequestsPerApi = settings.dailyRequestsPerApi || 3;
        const totalRequests = apiCredentialCount * dailyRequestsPerApi; // 根据环境变量配置每天请求次数

        // 计算开始和结束时间的总分钟数
        const startMinutes = startTime.hour * 60 + startTime.minute;
        let endMinutes = endTime.hour * 60 + endTime.minute;

        // 如果结束时间小于开始时间，说明跨天了
        if (endMinutes <= startMinutes) {
            endMinutes += 24 * 60; // 加上24小时
        }

        const totalMinutes = endMinutes - startMinutes;

        // 生成所有时间点
        for (let i = 0; i < totalRequests; i++) {
            let timeMinutes;

            if (i === 0) {
                // 第一次请求：开始时间
                timeMinutes = startMinutes;
            } else if (i === totalRequests - 1) {
                // 最后一次请求：结束时间
                timeMinutes = endMinutes;
            } else {
                // 中间的请求：均匀分配
                const intervalMinutes = totalMinutes / (totalRequests - 1);
                timeMinutes = startMinutes + (i * intervalMinutes);
            }

            let hour = Math.floor(timeMinutes / 60);
            const minute = Math.floor(timeMinutes % 60);

            // 处理跨天情况
            if (hour >= 24) {
                hour = hour - 24;
            }

            scheduleTimes.push({
                hour,
                minute,
                credentialIndex: i % apiCredentialCount // 轮换使用API凭证
            });
        }

        return scheduleTimes;
    }

    /**
     * 为单个用户创建调度任务
     * @param {string} nickname - 用户昵称
     * @param {Function} monitorCallback - 监控回调函数
     */
    createUserSchedule(nickname, monitorCallback) {
        try {
            // 获取用户配置
            const userConfig = configManager.getUserByNickname(nickname);
            if (!userConfig || !userConfig.apiCredentials) {
                console.error(`用户配置不存在或无API凭证: ${nickname}`);
                return false;
            }

            // 计算时间点
            const apiCredentialCount = userConfig.apiCredentials.length;
            const scheduleTimes = this.calculateScheduleTimes(apiCredentialCount);

            // 显示UTC+8时间点，用户友好
            const utc8Times = scheduleTimes.map(t => {
                const utcTime = `${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}`;
                return TimeUtils.convertUTCTimesToUTC8([utcTime])[0];
            });
            console.log(`用户 ${nickname} 的调度时间点: [ ${utc8Times.map(t => `'${t}'`).join(', ')} ]`);

            // 清理该用户的旧任务
            this.stopUserSchedule(nickname);

            // 创建新的定时任务
            const userTasks = [];
            scheduleTimes.forEach((timePoint, index) => {
                // 根据是否有秒数来决定cron表达式格式
                let cronExpression;
                if (timePoint.isRecurring) {
                    // 开发/测试模式：循环执行，每隔intervalMinutes分钟执行一次
                    // 使用标准的分钟间隔格式
                    cronExpression = `*/${timePoint.intervalMinutes} * * * *`;
                } else if (timePoint.second !== undefined) {
                    // 开发/测试模式：包含秒数的一次性cron表达式
                    cronExpression = `${timePoint.second} ${timePoint.minute} ${timePoint.hour} * * *`;
                } else {
                    // 生产模式：传统的分钟级cron表达式
                    cronExpression = `${timePoint.minute} ${timePoint.hour} * * *`;
                }

                const task = cron.schedule(cronExpression, async () => {
                    const utcTimeStr = timePoint.second !== undefined
                        ? `${timePoint.hour}:${timePoint.minute.toString().padStart(2, '0')}:${timePoint.second.toString().padStart(2, '0')}`
                        : `${timePoint.hour}:${timePoint.minute.toString().padStart(2, '0')}`;

                    // 转换为UTC+8显示
                    const utc8TimeStr = TimeUtils.convertUTCTimesToUTC8([utcTimeStr.substring(0, 5)])[0];
                    const taskId = `${nickname}-${timePoint.credentialIndex}-${utcTimeStr}`;
                    console.log(`触发监控任务 [用户: ${nickname}, 时间: ${utc8TimeStr}, 凭证索引: ${timePoint.credentialIndex}]`);

                    // 更新任务统计
                    this.updateTaskStats(taskId, 'started');

                    try {
                        await this.executeWithRetry(taskId, nickname, timePoint.credentialIndex, monitorCallback);
                        this.updateTaskStats(taskId, 'success');
                    } catch (error) {
                        console.error(`监控任务执行失败 [用户: ${nickname}]:`, error);
                        this.updateTaskStats(taskId, 'failed', error.message);
                    }
                }, {
                    scheduled: false, // 先不启动，等待统一启动
                    timezone: 'UTC' // 使用UTC时间
                });

                userTasks.push({
                    task,
                    timePoint,
                    cronExpression,
                    index
                });
            });

            // 保存用户的调度信息
            this.scheduledTasks.set(nickname, userTasks);
            this.userSchedules.set(nickname, {
                apiCredentialCount,
                scheduleTimes,
                createdAt: new Date().toISOString()
            });

            console.log(`用户 ${nickname} 的调度任务创建完成，共 ${userTasks.length} 个时间点`);
            return true;

        } catch (error) {
            console.error(`创建用户调度失败 [${nickname}]:`, error);
            return false;
        }
    }

    /**
     * 停止单个用户的调度任务
     * @param {string} nickname - 用户昵称
     */
    stopUserSchedule(nickname) {
        const userTasks = this.scheduledTasks.get(nickname);
        if (userTasks) {
            userTasks.forEach(({ task }) => {
                if (task) {
                    task.stop();
                    task.destroy();
                }
            });
            this.scheduledTasks.delete(nickname);
            this.userSchedules.delete(nickname);
            console.log(`用户 ${nickname} 的调度任务已停止`);
        }
    }

    /**
     * 初始化所有用户的调度任务
     * @param {Function} monitorCallback - 监控回调函数
     */
    initializeAllSchedules(monitorCallback) {
        try {
            const userNicknames = configManager.getMonitoredUserNicknames();
            console.log(`开始初始化 ${userNicknames.length} 个用户的调度任务`);

            let successCount = 0;
            userNicknames.forEach(nickname => {
                if (configManager.isUserMonitorEnabled(nickname)) {
                    const success = this.createUserSchedule(nickname, monitorCallback);
                    if (success) {
                        successCount++;
                    }
                } else {
                    console.log(`跳过已禁用的用户: ${nickname}`);
                }
            });

            console.log(`调度任务初始化完成，成功: ${successCount}/${userNicknames.length}`);
            return successCount > 0;

        } catch (error) {
            console.error('初始化调度任务失败:', error);
            return false;
        }
    }

    /**
     * 启动所有调度任务
     */
    startAllSchedules() {
        if (this.isRunning) {
            console.log('调度任务已在运行中');
            return false;
        }

        let totalTasks = 0;
        for (const [nickname, userTasks] of this.scheduledTasks.entries()) {
            userTasks.forEach(({ task }) => {
                task.start();
                totalTasks++;
            });
            console.log(`启动用户 ${nickname} 的 ${userTasks.length} 个调度任务`);
        }

        this.isRunning = true;
        console.log(`所有调度任务已启动，共 ${totalTasks} 个任务`);
        return true;
    }

    /**
     * 停止所有调度任务
     */
    stopAllSchedules() {
        if (!this.isRunning) {
            console.log('调度任务未在运行');
            return false;
        }

        const userNicknames = Array.from(this.scheduledTasks.keys());
        userNicknames.forEach(nickname => {
            this.stopUserSchedule(nickname);
        });

        this.isRunning = false;
        console.log('所有调度任务已停止');
        return true;
    }

    /**
     * 获取调度状态
     * @returns {Object} 调度状态信息
     */
    getScheduleStatus() {
        const status = {
            isRunning: this.isRunning,
            totalUsers: this.scheduledTasks.size,
            users: {}
        };

        for (const [nickname, schedule] of this.userSchedules.entries()) {
            const userTasks = this.scheduledTasks.get(nickname);
            status.users[nickname] = {
                apiCredentialCount: schedule.apiCredentialCount,
                scheduleTimes: schedule.scheduleTimes,
                taskCount: userTasks ? userTasks.length : 0,
                createdAt: schedule.createdAt,
                isActive: userTasks ? userTasks.some(({ task }) => task.running) : false
            };
        }

        return status;
    }

    /**
     * 获取指定用户的下次执行信息
     * @param {string} nickname - 用户昵称
     * @returns {Object|null} 下次执行信息
     */
    getNextExecutionInfo(nickname) {
        const userSchedule = this.userSchedules.get(nickname);
        if (!userSchedule || !userSchedule.scheduleTimes) {
            return null;
        }

        return TimeUtils.getNextExecutionInfo(userSchedule.scheduleTimes);
    }

    /**
     * 获取下次执行时间
     * @param {string} nickname - 用户昵称（可选）
     * @returns {Object} 下次执行时间信息
     */
    getNextExecutionTimes(nickname = null) {
        const utcTime = this.getCurrentUTCTime();
        const today = utcTime.toISOString().split('T')[0];
        const currentHour = utcTime.getUTCHours();
        const currentMinute = utcTime.getUTCMinutes();
        const currentTime = currentHour * 60 + currentMinute;

        const result = {};

        const processUser = (userNickname) => {
            const schedule = this.userSchedules.get(userNickname);
            if (!schedule) return;

            const nextTimes = [];
            schedule.scheduleTimes.forEach(timePoint => {
                const timeInMinutes = timePoint.hour * 60 + timePoint.minute;

                if (timeInMinutes > currentTime) {
                    // 今天还有时间点
                    nextTimes.push({
                        date: today,
                        hour: timePoint.hour,
                        minute: timePoint.minute,
                        credentialIndex: timePoint.credentialIndex
                    });
                } else {
                    // 明天的时间点
                    const tomorrow = new Date(utcTime);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    nextTimes.push({
                        date: tomorrow.toISOString().split('T')[0],
                        hour: timePoint.hour,
                        minute: timePoint.minute,
                        credentialIndex: timePoint.credentialIndex
                    });
                }
            });

            result[userNickname] = nextTimes.sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute);
            });
        };

        if (nickname) {
            processUser(nickname);
        } else {
            for (const userNickname of this.userSchedules.keys()) {
                processUser(userNickname);
            }
        }

        return result;
    }

    /**
     * 手动触发用户监控（用于测试）
     * @param {string} nickname - 用户昵称
     * @param {number} credentialIndex - 凭证索引
     * @param {Function} monitorCallback - 监控回调函数
     */
    async manualTrigger(nickname, credentialIndex, monitorCallback) {
        console.log(`手动触发监控任务 [用户: ${nickname}, 凭证索引: ${credentialIndex}]`);

        try {
            await monitorCallback(nickname, credentialIndex);
            console.log(`手动监控任务完成 [用户: ${nickname}]`);
        } catch (error) {
            console.error(`手动监控任务失败 [用户: ${nickname}]:`, error);
        }
    }

    /**
     * 带重试机制的任务执行
     * @param {string} taskId - 任务ID
     * @param {string} nickname - 用户昵称
     * @param {number} credentialIndex - 凭证索引
     * @param {Function} monitorCallback - 监控回调函数
     */
    async executeWithRetry(taskId, nickname, credentialIndex, monitorCallback) {
        let lastError = null;
        let delay = this.retryConfig.retryDelay;

        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`重试监控任务 [用户: ${nickname}, 尝试: ${attempt}/${this.retryConfig.maxRetries}]`);
                    await this.sleep(delay);
                    delay *= this.retryConfig.backoffMultiplier;
                }

                await monitorCallback(nickname, credentialIndex);

                if (attempt > 0) {
                    console.log(`监控任务重试成功 [用户: ${nickname}, 尝试: ${attempt}]`);
                }
                return; // 成功执行，退出重试循环

            } catch (error) {
                lastError = error;
                console.error(`监控任务执行失败 [用户: ${nickname}, 尝试: ${attempt + 1}]:`, error.message);

                // 如果是最后一次尝试，抛出错误
                if (attempt === this.retryConfig.maxRetries) {
                    throw lastError;
                }
            }
        }
    }

    /**
     * 更新任务执行统计
     * @param {string} taskId - 任务ID
     * @param {string} status - 状态 (started, success, failed)
     * @param {string} errorMessage - 错误信息（可选）
     */
    updateTaskStats(taskId, status, errorMessage = null) {
        const now = new Date().toISOString();

        if (!this.taskStats.has(taskId)) {
            this.taskStats.set(taskId, {
                taskId,
                totalRuns: 0,
                successCount: 0,
                failureCount: 0,
                lastRun: null,
                lastSuccess: null,
                lastFailure: null,
                lastError: null
            });
        }

        const stats = this.taskStats.get(taskId);

        switch (status) {
            case 'started':
                stats.totalRuns++;
                stats.lastRun = now;
                break;
            case 'success':
                stats.successCount++;
                stats.lastSuccess = now;
                break;
            case 'failed':
                stats.failureCount++;
                stats.lastFailure = now;
                stats.lastError = errorMessage;
                break;
        }

        this.taskStats.set(taskId, stats);
    }

    /**
     * 获取任务执行统计
     * @param {string} nickname - 用户昵称（可选）
     * @returns {Object} 任务统计信息
     */
    getTaskStats(nickname = null) {
        const result = {};

        for (const [taskId, stats] of this.taskStats.entries()) {
            if (nickname && !taskId.startsWith(nickname + '-')) {
                continue;
            }

            const successRate = stats.totalRuns > 0 ?
                ((stats.successCount / stats.totalRuns) * 100).toFixed(2) : '0.00';

            result[taskId] = {
                ...stats,
                successRate: `${successRate}%`
            };
        }

        return result;
    }

    /**
     * 清理任务统计数据
     * @param {number} daysToKeep - 保留天数，默认7天
     */
    cleanupTaskStats(daysToKeep = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffTime = cutoffDate.toISOString();

        let cleanedCount = 0;
        for (const [taskId, stats] of this.taskStats.entries()) {
            if (stats.lastRun && stats.lastRun < cutoffTime) {
                this.taskStats.delete(taskId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`清理了 ${cleanedCount} 个过期的任务统计记录`);
        }
    }

    /**
     * 重新加载用户配置并更新调度
     * @param {Function} monitorCallback - 监控回调函数
     */
    async reloadSchedules(monitorCallback) {
        console.log('重新加载调度配置...');

        // 停止所有现有任务
        this.stopAllSchedules();

        // 重新初始化
        const success = this.initializeAllSchedules(monitorCallback);

        if (success) {
            // 启动新的任务
            this.startAllSchedules();
            console.log('调度配置重新加载完成');
        } else {
            console.error('调度配置重新加载失败');
        }

        return success;
    }

    /**
     * 暂停工具函数
     * @param {number} ms - 暂停毫秒数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 创建调度管理器实例
export const scheduleManager = new ScheduleManager();