/**
 * 基础调度器类
 * 提供所有调度器的通用功能和接口规范
 */
import { getLogger } from '../../core/logger.js';

export class BaseScheduler {
    constructor(moduleName, monitor, config) {
        this.moduleName = moduleName;
        this.monitor = monitor;
        this.config = config;
        this.logger = getLogger(`${moduleName}-scheduler`);
        this.isRunning = false;
        this.scheduledTasks = new Map();
        this.taskStats = new Map();
        this.retryConfig = {
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 5000,
            backoffMultiplier: config.backoffMultiplier || 2
        };
    }

    /**
     * 启动调度
     * @returns {Promise<boolean>} 是否启动成功
     */
    async start() {
        try {
            if (this.isRunning) {
                this.logger.warn(`调度器 ${this.moduleName} 已在运行中`);
                return true;
            }

            this.logger.info(`启动调度器: ${this.moduleName}`);
            
            // 执行子类特定的启动逻辑
            await this.onStart();

            this.isRunning = true;
            this.logger.info(`调度器 ${this.moduleName} 启动成功`);
            return true;

        } catch (error) {
            this.logger.error(`调度器 ${this.moduleName} 启动失败`, { error: error.message });
            return false;
        }
    }

    /**
     * 停止调度
     * @returns {Promise<boolean>} 是否停止成功
     */
    async stop() {
        try {
            if (!this.isRunning) {
                this.logger.warn(`调度器 ${this.moduleName} 已停止`);
                return true;
            }

            this.logger.info(`停止调度器: ${this.moduleName}`);

            // 停止所有调度任务
            await this.stopAllTasks();

            // 执行子类特定的停止逻辑
            await this.onStop();

            this.isRunning = false;
            this.logger.info(`调度器 ${this.moduleName} 已停止`);
            return true;

        } catch (error) {
            this.logger.error(`调度器 ${this.moduleName} 停止失败`, { error: error.message });
            return false;
        }
    }

    /**
     * 重启调度
     * @returns {Promise<boolean>} 是否重启成功
     */
    async restart() {
        this.logger.info(`重启调度器: ${this.moduleName}`);
        
        const stopped = await this.stop();
        if (!stopped) {
            return false;
        }

        await this.sleep(1000);
        return await this.start();
    }

    /**
     * 创建调度任务
     * @param {string} taskId - 任务ID
     * @param {string} schedule - 调度表达式或间隔
     * @param {Function} callback - 回调函数
     * @param {Object} options - 任务选项
     * @returns {boolean} 是否创建成功
     */
    createTask(taskId, schedule, callback, options = {}) {
        try {
            if (this.scheduledTasks.has(taskId)) {
                this.logger.warn(`任务 ${taskId} 已存在，将被替换`);
                this.removeTask(taskId);
            }

            const task = this.createScheduledTask(schedule, async () => {
                await this.executeTaskWithRetry(taskId, callback);
            }, options);

            this.scheduledTasks.set(taskId, {
                task,
                schedule,
                callback,
                options,
                createdAt: new Date(),
                lastRun: null,
                nextRun: null
            });

            this.initializeTaskStats(taskId);
            this.logger.info(`创建调度任务: ${taskId}`);
            return true;

        } catch (error) {
            this.logger.error(`创建调度任务失败: ${taskId}`, { error: error.message });
            return false;
        }
    }

    /**
     * 移除调度任务
     * @param {string} taskId - 任务ID
     * @returns {boolean} 是否移除成功
     */
    removeTask(taskId) {
        try {
            const taskInfo = this.scheduledTasks.get(taskId);
            if (!taskInfo) {
                this.logger.warn(`任务 ${taskId} 不存在`);
                return false;
            }

            // 停止任务
            if (taskInfo.task && typeof taskInfo.task.stop === 'function') {
                taskInfo.task.stop();
            }

            this.scheduledTasks.delete(taskId);
            this.logger.info(`移除调度任务: ${taskId}`);
            return true;

        } catch (error) {
            this.logger.error(`移除调度任务失败: ${taskId}`, { error: error.message });
            return false;
        }
    }

    /**
     * 停止所有任务
     */
    async stopAllTasks() {
        const taskIds = Array.from(this.scheduledTasks.keys());
        
        for (const taskId of taskIds) {
            this.removeTask(taskId);
        }

        this.logger.info(`停止了 ${taskIds.length} 个调度任务`);
    }

    /**
     * 带重试机制的任务执行
     * @param {string} taskId - 任务ID
     * @param {Function} callback - 回调函数
     */
    async executeTaskWithRetry(taskId, callback) {
        let lastError = null;
        let delay = this.retryConfig.retryDelay;

        this.updateTaskStats(taskId, 'started');

        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    this.logger.info(`重试任务 ${taskId} (尝试 ${attempt}/${this.retryConfig.maxRetries})`);
                    await this.sleep(delay);
                    delay *= this.retryConfig.backoffMultiplier;
                }

                await callback();

                if (attempt > 0) {
                    this.logger.info(`任务 ${taskId} 重试成功 (尝试 ${attempt})`);
                }

                this.updateTaskStats(taskId, 'success');
                this.updateTaskLastRun(taskId);
                return;

            } catch (error) {
                lastError = error;
                this.logger.error(`任务 ${taskId} 执行失败 (尝试 ${attempt + 1})`, { error: error.message });

                if (attempt === this.retryConfig.maxRetries) {
                    this.updateTaskStats(taskId, 'failed', error.message);
                    throw lastError;
                }
            }
        }
    }

    /**
     * 更新任务最后运行时间
     * @param {string} taskId - 任务ID
     */
    updateTaskLastRun(taskId) {
        const taskInfo = this.scheduledTasks.get(taskId);
        if (taskInfo) {
            taskInfo.lastRun = new Date();
        }
    }

    /**
     * 初始化任务统计
     * @param {string} taskId - 任务ID
     */
    initializeTaskStats(taskId) {
        this.taskStats.set(taskId, {
            taskId,
            totalRuns: 0,
            successCount: 0,
            failureCount: 0,
            lastRun: null,
            lastSuccess: null,
            lastFailure: null,
            lastError: null,
            createdAt: new Date()
        });
    }

    /**
     * 更新任务执行统计
     * @param {string} taskId - 任务ID
     * @param {string} status - 状态 (started, success, failed)
     * @param {string} errorMessage - 错误信息（可选）
     */
    updateTaskStats(taskId, status, errorMessage = null) {
        const now = new Date();
        let stats = this.taskStats.get(taskId);

        if (!stats) {
            this.initializeTaskStats(taskId);
            stats = this.taskStats.get(taskId);
        }

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
     * 获取调度状态
     * @returns {Object} 调度状态信息
     */
    getStatus() {
        const tasks = {};
        
        for (const [taskId, taskInfo] of this.scheduledTasks.entries()) {
            const stats = this.taskStats.get(taskId);
            
            tasks[taskId] = {
                schedule: taskInfo.schedule,
                createdAt: taskInfo.createdAt,
                lastRun: taskInfo.lastRun,
                nextRun: taskInfo.nextRun,
                isActive: taskInfo.task && this.isTaskActive(taskInfo.task),
                statistics: stats ? {
                    ...stats,
                    successRate: stats.totalRuns > 0 ? 
                        ((stats.successCount / stats.totalRuns) * 100).toFixed(2) + '%' : '0%'
                } : null
            };
        }

        return {
            moduleName: this.moduleName,
            isRunning: this.isRunning,
            totalTasks: this.scheduledTasks.size,
            activeTasks: Array.from(this.scheduledTasks.values())
                .filter(taskInfo => this.isTaskActive(taskInfo.task)).length,
            tasks
        };
    }

    /**
     * 获取任务统计
     * @param {string} taskId - 任务ID（可选）
     * @returns {Object} 任务统计信息
     */
    getTaskStats(taskId = null) {
        if (taskId) {
            return this.taskStats.get(taskId) || null;
        }

        const result = {};
        for (const [id, stats] of this.taskStats.entries()) {
            const successRate = stats.totalRuns > 0 ?
                ((stats.successCount / stats.totalRuns) * 100).toFixed(2) : '0.00';

            result[id] = {
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
            this.logger.info(`清理了 ${cleanedCount} 个过期的任务统计记录`);
        }
    }

    /**
     * 调整调度频率
     * @param {string} taskId - 任务ID
     * @param {string} newSchedule - 新的调度表达式
     * @returns {boolean} 是否调整成功
     */
    async adjustScheduleFrequency(taskId, newSchedule) {
        try {
            const taskInfo = this.scheduledTasks.get(taskId);
            if (!taskInfo) {
                this.logger.error(`任务 ${taskId} 不存在`);
                return false;
            }

            // 重新创建任务
            const success = this.createTask(taskId, newSchedule, taskInfo.callback, taskInfo.options);
            
            if (success) {
                this.logger.info(`调整任务 ${taskId} 调度频率: ${taskInfo.schedule} -> ${newSchedule}`);
            }

            return success;

        } catch (error) {
            this.logger.error(`调整调度频率失败: ${taskId}`, { error: error.message });
            return false;
        }
    }

    /**
     * 手动触发任务
     * @param {string} taskId - 任务ID
     * @returns {Promise<boolean>} 是否触发成功
     */
    async manualTrigger(taskId) {
        try {
            const taskInfo = this.scheduledTasks.get(taskId);
            if (!taskInfo) {
                this.logger.error(`任务 ${taskId} 不存在`);
                return false;
            }

            this.logger.info(`手动触发任务: ${taskId}`);
            await this.executeTaskWithRetry(taskId, taskInfo.callback);
            return true;

        } catch (error) {
            this.logger.error(`手动触发任务失败: ${taskId}`, { error: error.message });
            return false;
        }
    }

    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== 子类需要实现的方法 ====================

    /**
     * 子类启动方法
     * @returns {Promise<void>}
     */
    async onStart() {
        // 子类实现
    }

    /**
     * 子类停止方法
     * @returns {Promise<void>}
     */
    async onStop() {
        // 子类实现
    }

    /**
     * 创建调度任务（子类实现）
     * @param {string} schedule - 调度表达式
     * @param {Function} callback - 回调函数
     * @param {Object} options - 选项
     * @returns {Object} 任务对象
     */
    createScheduledTask(schedule, callback, options) {
        throw new Error('子类必须实现 createScheduledTask 方法');
    }

    /**
     * 检查任务是否活跃（子类实现）
     * @param {Object} task - 任务对象
     * @returns {boolean} 是否活跃
     */
    isTaskActive(task) {
        return false; // 子类实现
    }
}