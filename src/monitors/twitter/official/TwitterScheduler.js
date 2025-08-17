/**
 * Twitter调度器
 * 基于现有scheduler.js重构的Twitter专用调度器
 */
import { BaseScheduler } from '../../base/BaseScheduler.js';
import cron from 'node-cron';

export class TwitterScheduler extends BaseScheduler {
    constructor(monitor, config) {
        super('twitter', monitor, config);
        this.userSchedules = new Map();
    }

    /**
     * 子类启动方法
     */
    async onStart() {
        // 初始化所有用户的调度任务
        await this.initializeAllSchedules();
        
        // 启动所有调度任务
        this.startAllTasks();
        
        this.logger.info('Twitter调度器启动完成');
    }

    /**
     * 子类停止方法
     */
    async onStop() {
        // 停止所有任务
        await this.stopAllTasks();
        
        // 清理用户调度信息
        this.userSchedules.clear();
        
        this.logger.info('Twitter调度器停止完成');
    }

    /**
     * 初始化所有用户的调度任务
     */
    async initializeAllSchedules() {
        try {
            const userNicknames = this.monitor.getMonitoredUserNicknames();
            this.logger.info(`开始初始化 ${userNicknames.length} 个用户的调度任务`);

            let successCount = 0;
            for (const nickname of userNicknames) {
                const success = this.createUserSchedule(nickname);
                if (success) {
                    successCount++;
                }
            }

            this.logger.info(`调度任务初始化完成，成功: ${successCount}/${userNicknames.length}`);
            return successCount > 0;

        } catch (error) {
            this.logger.error('初始化调度任务失败', { error: error.message });
            return false;
        }
    }

    /**
     * 为单个用户创建调度任务
     * @param {string} nickname - 用户昵称
     * @returns {boolean} 是否创建成功
     */
    createUserSchedule(nickname) {
        try {
            const userConfig = this.monitor.getUserByNickname(nickname);
            if (!userConfig || !userConfig.apiCredentials) {
                this.logger.error(`用户配置不存在或无API凭证: ${nickname}`);
                return false;
            }

            // 计算时间点
            const apiCredentialCount = userConfig.apiCredentials.length;
            const scheduleTimes = this.calculateScheduleTimes(apiCredentialCount);

            // 显示UTC+8时间点，用户友好
            const utc8Times = scheduleTimes.map(t => {
                const utcTime = `${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}`;
                // 简单的UTC到UTC+8转换
                const utcHour = t.hour;
                const utc8Hour = (utcHour + 8) % 24;
                return `${utc8Hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}`;
            });
            this.logger.info(`用户 ${nickname} 的调度时间点: [${utc8Times.join(', ')}]`);

            // 清理该用户的旧任务
            this.removeUserTasks(nickname);

            // 创建新的定时任务
            scheduleTimes.forEach((timePoint, index) => {
                const taskId = `${nickname}-${index}`;
                
                let cronExpression;
                if (timePoint.second !== undefined) {
                    // 开发/测试模式：包含秒数
                    cronExpression = `${timePoint.second} ${timePoint.minute} ${timePoint.hour} * * *`;
                } else {
                    // 生产模式：传统的分钟级cron表达式
                    cronExpression = `${timePoint.minute} ${timePoint.hour} * * *`;
                }

                const callback = async () => {
                    await this.monitor.monitorUser(nickname, timePoint.credentialIndex);
                };

                this.createTask(taskId, cronExpression, callback, {
                    timezone: 'UTC',
                    nickname: nickname,
                    credentialIndex: timePoint.credentialIndex
                });
            });

            // 保存用户的调度信息
            this.userSchedules.set(nickname, {
                apiCredentialCount,
                scheduleTimes,
                createdAt: new Date().toISOString()
            });

            this.logger.info(`用户 ${nickname} 的调度任务创建完成，共 ${scheduleTimes.length} 个时间点`);
            return true;

        } catch (error) {
            this.logger.error(`创建用户调度失败: ${nickname}`, { error: error.message });
            return false;
        }
    }

    /**
     * 移除用户的所有任务
     * @param {string} nickname - 用户昵称
     */
    removeUserTasks(nickname) {
        const tasksToRemove = [];
        
        for (const taskId of this.scheduledTasks.keys()) {
            if (taskId.startsWith(`${nickname}-`)) {
                tasksToRemove.push(taskId);
            }
        }

        tasksToRemove.forEach(taskId => {
            this.removeTask(taskId);
        });

        if (tasksToRemove.length > 0) {
            this.logger.info(`移除用户 ${nickname} 的 ${tasksToRemove.length} 个任务`);
        }
    }

    /**
     * 启动所有任务
     */
    startAllTasks() {
        let totalTasks = 0;
        
        for (const [taskId, taskInfo] of this.scheduledTasks.entries()) {
            if (taskInfo.task && typeof taskInfo.task.start === 'function') {
                taskInfo.task.start();
                totalTasks++;
            }
        }

        this.logger.info(`启动了 ${totalTasks} 个调度任务`);
    }

    /**
     * 计算用户的监控时间点
     * @param {number} apiCredentialCount - API凭证数量
     * @returns {Array} 时间点列表
     */
    calculateScheduleTimes(apiCredentialCount) {
        const settings = this.config.monitorSettings || {};

        const parseTime = (timeStr) => {
            const [hour, minute] = (timeStr || "09:00").split(':').map(Number);
            return { hour, minute };
        };

        const startTime = parseTime(settings.startTime || "09:00");
        const endTime = parseTime(settings.endTime || "23:00");
        const testMode = settings.testMode || false;
        const testIntervalMinutes = settings.testIntervalMinutes || 1;

        const scheduleTimes = [];
        const isProduction = process.env.NODE_ENV === 'production';

        if (testMode || !isProduction) {
            // 开发/测试模式
            this.logger.info(`${testMode ? '测试' : '开发'}模式启用 - 模拟生产环境时间点分配`);

            const totalRequests = apiCredentialCount * 3;
            const utcTime = new Date();
            const baseTime = new Date(utcTime.getTime() + 10000); // 10秒后开始

            for (let i = 0; i < totalRequests; i++) {
                const executeTime = new Date(baseTime.getTime() + (i * testIntervalMinutes * 60 * 1000));
                scheduleTimes.push({
                    hour: executeTime.getUTCHours(),
                    minute: executeTime.getUTCMinutes(),
                    second: executeTime.getUTCSeconds(),
                    credentialIndex: i % apiCredentialCount,
                    isDevelopment: true
                });
            }

            this.logger.info(`开发环境时间点分配：从 ${baseTime.toISOString()} 开始，每${testIntervalMinutes}分钟一个时间点`);
            return scheduleTimes;
        }

        // 生产模式
        this.logger.info(`生产模式 - 监控时间: ${settings.startTime} - ${settings.endTime}`);

        const dailyRequestsPerApi = settings.dailyRequestsPerApi || 3;
        const totalRequests = apiCredentialCount * dailyRequestsPerApi;

        const startMinutes = startTime.hour * 60 + startTime.minute;
        let endMinutes = endTime.hour * 60 + endTime.minute;

        if (endMinutes <= startMinutes) {
            endMinutes += 24 * 60;
        }

        const totalMinutes = endMinutes - startMinutes;

        for (let i = 0; i < totalRequests; i++) {
            let timeMinutes;

            if (i === 0) {
                timeMinutes = startMinutes;
            } else if (i === totalRequests - 1) {
                timeMinutes = endMinutes;
            } else {
                const intervalMinutes = totalMinutes / (totalRequests - 1);
                timeMinutes = startMinutes + (i * intervalMinutes);
            }

            let hour = Math.floor(timeMinutes / 60);
            const minute = Math.floor(timeMinutes % 60);

            if (hour >= 24) {
                hour = hour - 24;
            }

            scheduleTimes.push({
                hour,
                minute,
                credentialIndex: i % apiCredentialCount
            });
        }

        return scheduleTimes;
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

        // 简单实现：返回下一个调度时间
        const now = new Date();
        const currentHour = now.getUTCHours();
        const currentMinute = now.getUTCMinutes();
        
        for (const timePoint of userSchedule.scheduleTimes) {
            if (timePoint.hour > currentHour || 
                (timePoint.hour === currentHour && timePoint.minute > currentMinute)) {
                return {
                    nextRun: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
                                    timePoint.hour, timePoint.minute, 0),
                    credentialIndex: timePoint.credentialIndex
                };
            }
        }
        
        // 如果今天没有更多的执行时间，返回明天的第一个
        const firstTime = userSchedule.scheduleTimes[0];
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        return {
            nextRun: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(),
                            firstTime.hour, firstTime.minute, 0),
            credentialIndex: firstTime.credentialIndex
        };
    }

    /**
     * 创建调度任务（实现基类方法）
     * @param {string} schedule - cron表达式
     * @param {Function} callback - 回调函数
     * @param {Object} options - 选项
     * @returns {Object} 任务对象
     */
    createScheduledTask(schedule, callback, options) {
        return cron.schedule(schedule, callback, {
            scheduled: false,
            timezone: options.timezone || 'UTC'
        });
    }

    /**
     * 检查任务是否活跃（实现基类方法）
     * @param {Object} task - 任务对象
     * @returns {boolean} 是否活跃
     */
    isTaskActive(task) {
        return task && typeof task.running !== 'undefined' ? task.running : false;
    }

    /**
     * 获取调度状态
     * @returns {Object} 调度状态信息
     */
    getScheduleStatus() {
        const baseStatus = this.getStatus();
        
        const users = {};
        for (const [nickname, schedule] of this.userSchedules.entries()) {
            const userTasks = Array.from(this.scheduledTasks.keys())
                .filter(taskId => taskId.startsWith(`${nickname}-`));
            
            users[nickname] = {
                apiCredentialCount: schedule.apiCredentialCount,
                scheduleTimes: schedule.scheduleTimes,
                taskCount: userTasks.length,
                createdAt: schedule.createdAt,
                isActive: userTasks.some(taskId => {
                    const taskInfo = this.scheduledTasks.get(taskId);
                    return taskInfo && this.isTaskActive(taskInfo.task);
                })
            };
        }

        return {
            ...baseStatus,
            users
        };
    }

    /**
     * 手动触发用户监控
     * @param {string} nickname - 用户昵称
     * @param {number} credentialIndex - 凭证索引
     */
    async manualTriggerUser(nickname, credentialIndex = 0) {
        this.logger.info(`手动触发监控任务: ${nickname}, 凭证索引: ${credentialIndex}`);

        try {
            await this.monitor.monitorUser(nickname, credentialIndex);
            this.logger.info(`手动监控任务完成: ${nickname}`);
        } catch (error) {
            this.logger.error(`手动监控任务失败: ${nickname}`, { error: error.message });
        }
    }
}