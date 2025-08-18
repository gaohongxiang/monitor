/**
 * 统一通知管理器
 * 支持多监控源的通知发送和管理
 */
import { getCurrentTimeUTC8, formatTimestamp } from '../utils/timeUtils.js';

export class UnifiedNotifierManager {
    constructor(config) {
        this.config = config;
        this.notifiers = {};
        this.messageFormatters = {};
        this.notificationQueue = [];
        this.isProcessing = false;
        this.databaseManager = null;
        
        // 防刷屏机制
        this.throttleMap = new Map(); // 存储最近发送的消息时间
        this.throttleInterval = config.throttleInterval || 60000; // 1分钟防刷屏间隔
        this.maxRetries = config.maxRetries || 3;
        this.retryDelay = config.retryDelay || 5000;
        
        // 批量发送配置
        this.batchSize = config.batchSize || 5;
        this.batchTimeout = config.batchTimeout || 30000; // 30秒批量超时
        this.pendingBatches = new Map();
        
        // 统计信息
        this.statistics = {
            totalSent: 0,
            totalFailed: 0,
            totalThrottled: 0,
            lastResetTime: Date.now()
        };
        
        // 初始化通知器
        this.initializeNotifiers();
        this.initializeFormatters();
        
        // 启动批量处理定时器
        this.startBatchProcessor();
    }

    /**
     * 初始化通知器
     */
    initializeNotifiers() {
        if (this.config.dingtalk && this.config.dingtalk.accessToken) {
            this.notifiers.dingtalk = new DingTalkNotifier(this.config.dingtalk);
        }
    }

    /**
     * 初始化消息格式化器
     */
    initializeFormatters() {
        this.messageFormatters.twitter = new TwitterMessageFormatter();
        this.messageFormatters.binance = new BinanceMessageFormatter();
        this.messageFormatters.price = new PriceMessageFormatter();
    }

    /**
     * 启动批量处理定时器
     */
    startBatchProcessor() {
        setInterval(() => {
            this.processPendingBatches();
        }, 10000); // 每10秒检查一次待处理批次
    }

    /**
     * 发送通知（支持防刷屏和智能批量）
     * @param {string} source - 监控源名称
     * @param {Object|Array} data - 通知数据
     * @param {Object} options - 发送选项
     * @returns {Promise<Object>} 发送结果
     */
    async sendNotification(source, data, options = {}) {
        try {
            const formatter = this.messageFormatters[source];
            if (!formatter) {
                throw new Error(`未找到 ${source} 的消息格式化器`);
            }

            // 检查防刷屏
            if (this.isThrottled(source, data)) {
                this.statistics.totalThrottled++;
                console.log(`${source} 通知被防刷屏机制阻止`);
                return { success: false, error: '防刷屏限制', throttled: true };
            }

            // 智能批量处理
            if (options.enableBatching !== false && this.shouldBatch(source, data)) {
                return await this.addToBatch(source, data, options);
            }

            // 单条消息处理
            const message = formatter.format(data);
            const messageHash = this.generateMessageHash(message);
            
            // 记录发送时间用于防刷屏
            this.recordMessageSent(source, messageHash);
            
            const notificationId = await this.saveNotificationHistory(source, 'single', message);
            
            const result = await this.sendWithRetry(message, options);
            
            if (notificationId) {
                await this.updateNotificationStatus(notificationId, result.success ? 'sent' : 'failed', result.error);
            }

            // 更新统计
            if (result.success) {
                this.statistics.totalSent++;
            } else {
                this.statistics.totalFailed++;
            }

            return result;

        } catch (error) {
            console.error(`发送${source}通知失败:`, error);
            this.statistics.totalFailed++;
            return { success: false, error: error.message };
        }
    }

    /**
     * 检查是否应该被防刷屏限制
     * @param {string} source - 监控源
     * @param {Object} data - 数据
     * @returns {boolean} 是否被限制
     */
    isThrottled(source, data) {
        const message = this.messageFormatters[source].format(data);
        const messageHash = this.generateMessageHash(message);
        const throttleKey = `${source}:${messageHash}`;
        
        const lastSentTime = this.throttleMap.get(throttleKey);
        if (!lastSentTime) {
            return false;
        }

        const timeSinceLastSent = Date.now() - lastSentTime;
        return timeSinceLastSent < this.throttleInterval;
    }

    /**
     * 记录消息发送时间
     * @param {string} source - 监控源
     * @param {string} messageHash - 消息哈希
     */
    recordMessageSent(source, messageHash) {
        const throttleKey = `${source}:${messageHash}`;
        this.throttleMap.set(throttleKey, Date.now());
        
        // 清理过期的防刷屏记录
        this.cleanupThrottleMap();
    }

    /**
     * 清理过期的防刷屏记录
     */
    cleanupThrottleMap() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, timestamp] of this.throttleMap.entries()) {
            if (now - timestamp > this.throttleInterval * 2) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => this.throttleMap.delete(key));
    }

    /**
     * 生成消息哈希
     * @param {string} message - 消息内容
     * @returns {string} 哈希值
     */
    generateMessageHash(message) {
        // 简单的哈希函数，实际应用中可以使用更复杂的算法
        let hash = 0;
        for (let i = 0; i < message.length; i++) {
            const char = message.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return hash.toString();
    }

    /**
     * 判断是否应该批量处理
     * @param {string} source - 监控源
     * @param {Object} data - 数据
     * @returns {boolean} 是否应该批量
     */
    shouldBatch(source, data) {
        // 对于数组数据，如果数量较少，可以考虑等待更多数据一起发送
        if (Array.isArray(data)) {
            return data.length <= this.batchSize;
        }
        
        // 对于单条数据，可以根据优先级决定是否批量
        return data.priority !== 'urgent';
    }

    /**
     * 添加到批量处理队列
     * @param {string} source - 监控源
     * @param {Object|Array} data - 数据
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 处理结果
     */
    async addToBatch(source, data, options) {
        const batchKey = `${source}:${options.batchGroup || 'default'}`;
        
        if (!this.pendingBatches.has(batchKey)) {
            this.pendingBatches.set(batchKey, {
                source,
                items: [],
                options,
                createdAt: Date.now(),
                timeout: null
            });
        }

        const batch = this.pendingBatches.get(batchKey);
        
        // 添加数据到批次
        if (Array.isArray(data)) {
            batch.items.push(...data);
        } else {
            batch.items.push(data);
        }

        // 如果批次已满或超时，立即处理
        if (batch.items.length >= this.batchSize) {
            return await this.processBatch(batchKey);
        }

        // 设置超时处理
        if (batch.timeout) {
            clearTimeout(batch.timeout);
        }
        
        batch.timeout = setTimeout(() => {
            this.processBatch(batchKey);
        }, this.batchTimeout);

        return { success: true, batched: true, batchSize: batch.items.length };
    }

    /**
     * 处理单个批次
     * @param {string} batchKey - 批次键
     * @returns {Promise<Object>} 处理结果
     */
    async processBatch(batchKey) {
        const batch = this.pendingBatches.get(batchKey);
        if (!batch || batch.items.length === 0) {
            return { success: false, error: '批次为空' };
        }

        try {
            const formatter = this.messageFormatters[batch.source];
            const message = formatter.formatBatch(batch.items);
            const notificationId = await this.saveNotificationHistory(batch.source, 'batch', message);
            
            const result = await this.sendWithRetry(message, batch.options);
            
            if (notificationId) {
                await this.updateNotificationStatus(notificationId, result.success ? 'sent' : 'failed', result.error);
            }

            // 更新统计
            if (result.success) {
                this.statistics.totalSent++;
            } else {
                this.statistics.totalFailed++;
            }

            // 清理批次
            if (batch.timeout) {
                clearTimeout(batch.timeout);
            }
            this.pendingBatches.delete(batchKey);

            console.log(`批量发送完成: ${batch.source}, 项目数: ${batch.items.length}`);
            return result;

        } catch (error) {
            console.error(`批量处理失败: ${batchKey}`, error);
            this.statistics.totalFailed++;
            
            // 清理批次
            this.pendingBatches.delete(batchKey);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理所有待处理批次
     */
    async processPendingBatches() {
        const now = Date.now();
        const expiredBatches = [];

        for (const [batchKey, batch] of this.pendingBatches.entries()) {
            // 检查是否超时
            if (now - batch.createdAt > this.batchTimeout) {
                expiredBatches.push(batchKey);
            }
        }

        // 处理超时的批次
        for (const batchKey of expiredBatches) {
            await this.processBatch(batchKey);
        }
    }

    /**
     * 带重试的发送
     * @param {string} message - 消息内容
     * @param {Object} options - 发送选项
     * @returns {Promise<Object>} 发送结果
     */
    async sendWithRetry(message, options = {}) {
        let lastError = null;
        const maxRetries = options.maxRetries || this.maxRetries;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.sendToRecipients(message, options);
                
                if (result.success) {
                    if (attempt > 1) {
                        console.log(`重试成功: 第${attempt}次尝试`);
                    }
                    return result;
                }
                
                lastError = new Error(result.error);
                
            } catch (error) {
                lastError = error;
            }

            // 如果不是最后一次尝试，等待后重试
            if (attempt < maxRetries) {
                const delay = this.retryDelay * Math.pow(2, attempt - 1); // 指数退避
                console.log(`发送失败，${delay}ms后进行第${attempt + 1}次重试`);
                await this.sleep(delay);
            }
        }

        return {
            success: false,
            error: lastError ? lastError.message : '未知错误',
            attempts: maxRetries
        };
    }

    /**
     * 批量发送通知
     * @param {string} source - 监控源名称
     * @param {Array} dataArray - 数据数组
     * @param {Object} options - 发送选项
     * @returns {Promise<Array>} 发送结果数组
     */
    async sendBatchNotification(source, dataArray, options = {}) {
        const batches = this.chunkArray(dataArray, this.config.batchSize);
        const results = [];

        for (const batch of batches) {
            const formatter = this.messageFormatters[source];
            const message = formatter.formatBatch(batch);
            const notificationId = await this.saveNotificationHistory(source, 'batch', message);
            
            const result = await this.sendToRecipients(message, options);
            results.push(result);

            if (notificationId) {
                await this.updateNotificationStatus(notificationId, result.success ? 'sent' : 'failed', result.error);
            }

            // 批次间延迟，避免频率限制
            if (batches.indexOf(batch) < batches.length - 1) {
                await this.sleep(1000);
            }
        }

        return results;
    }

    /**
     * 发送到接收者
     * @param {string} message - 消息内容
     * @param {Object} options - 发送选项
     * @returns {Promise<Object>} 发送结果
     */
    async sendToRecipients(message, options = {}) {
        const recipients = options.recipients || ['dingtalk'];
        const results = [];

        for (const recipient of recipients) {
            const notifier = this.notifiers[recipient];
            if (!notifier) {
                console.warn(`未找到通知器: ${recipient}`);
                continue;
            }

            try {
                const result = await notifier.send(message, options);
                results.push({ recipient, ...result });
            } catch (error) {
                console.error(`发送到 ${recipient} 失败:`, error);
                results.push({ recipient, success: false, error: error.message });
            }
        }

        // 返回综合结果
        const success = results.some(r => r.success);
        const errors = results.filter(r => !r.success).map(r => r.error);
        
        return {
            success,
            results,
            error: errors.length > 0 ? errors.join('; ') : null
        };
    }

    /**
     * 队列化发送通知
     * @param {string} source - 监控源名称
     * @param {Object} data - 通知数据
     * @param {Object} options - 发送选项
     */
    async queueNotification(source, data, options = {}) {
        this.notificationQueue.push({ source, data, options, timestamp: Date.now() });
        
        if (!this.isProcessing) {
            this.processNotificationQueue();
        }
    }

    /**
     * 处理通知队列
     */
    async processNotificationQueue() {
        if (this.isProcessing || this.notificationQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            while (this.notificationQueue.length > 0) {
                const notification = this.notificationQueue.shift();
                await this.sendNotification(notification.source, notification.data, notification.options);
                
                // 队列处理间隔
                await this.sleep(500);
            }
        } catch (error) {
            console.error('处理通知队列时出错:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 保存通知历史
     * @param {string} source - 监控源
     * @param {string} type - 通知类型
     * @param {string} content - 通知内容
     * @returns {Promise<number|null>} 通知ID
     */
    async saveNotificationHistory(source, type, content) {
        if (this.databaseManager) {
            return await this.databaseManager.saveNotificationHistory(source, type, content);
        }
        return null;
    }

    /**
     * 更新通知状态
     * @param {number} notificationId - 通知ID
     * @param {string} status - 状态
     * @param {string} error - 错误信息
     */
    async updateNotificationStatus(notificationId, status, error = null) {
        if (this.databaseManager) {
            await this.databaseManager.updateNotificationStatus(notificationId, status, error);
        }
    }

    /**
     * 设置数据库管理器
     * @param {Object} databaseManager - 数据库管理器实例
     */
    setDatabaseManager(databaseManager) {
        this.databaseManager = databaseManager;
    }

    /**
     * 数组分块
     * @param {Array} array - 原数组
     * @param {number} size - 块大小
     * @returns {Array} 分块后的数组
     */
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * 获取通知统计信息
     * @returns {Object} 统计信息
     */
    getStatistics() {
        const uptime = Date.now() - this.statistics.lastResetTime;
        
        return {
            ...this.statistics,
            uptime: uptime,
            pendingBatches: this.pendingBatches.size,
            queueLength: this.notificationQueue.length,
            throttleMapSize: this.throttleMap.size,
            successRate: this.statistics.totalSent > 0 
                ? (this.statistics.totalSent / (this.statistics.totalSent + this.statistics.totalFailed) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * 重置统计信息
     */
    resetStatistics() {
        this.statistics = {
            totalSent: 0,
            totalFailed: 0,
            totalThrottled: 0,
            lastResetTime: Date.now()
        };
        console.log('通知统计信息已重置');
    }

    /**
     * 获取通知历史
     * @param {Object} filters - 过滤条件
     * @returns {Promise<Array>} 通知历史列表
     */
    async getNotificationHistory(filters = {}) {
        if (!this.databaseManager) {
            return [];
        }

        try {
            const { source, status, limit = 50, offset = 0 } = filters;
            let query = 'SELECT * FROM notification_history WHERE 1=1';
            const params = [];
            let paramIndex = 1;

            if (source) {
                query += ` AND module_name = $${paramIndex}`;
                params.push(source);
                paramIndex++;
            }

            if (status) {
                query += ` AND status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(limit, offset);

            const result = await this.databaseManager.pool.query(query, params);
            return result.rows;

        } catch (error) {
            console.error('获取通知历史失败:', error.message);
            return [];
        }
    }

    /**
     * 清理过期的通知历史
     * @param {number} retentionDays - 保留天数
     * @returns {Promise<number>} 清理的记录数
     */
    async cleanupNotificationHistory(retentionDays = 7) {
        if (!this.databaseManager) {
            return 0;
        }

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            const result = await this.databaseManager.pool.query(
                'DELETE FROM notification_history WHERE created_at < $1',
                [cutoffDate]
            );

            const deletedCount = result.rowCount;
            console.log(`清理了 ${deletedCount} 条过期通知历史记录`);
            return deletedCount;

        } catch (error) {
            console.error('清理通知历史失败:', error.message);
            return 0;
        }
    }

    /**
     * 测试所有通知器连接
     * @returns {Promise<Object>} 测试结果
     */
    async testAllConnections() {
        const results = {};

        for (const [name, notifier] of Object.entries(this.notifiers)) {
            try {
                if (typeof notifier.testConnection === 'function') {
                    results[name] = await notifier.testConnection();
                } else {
                    // 如果没有测试方法，发送一条测试消息
                    const testResult = await notifier.send('🔔 通知器连接测试');
                    results[name] = testResult.success;
                }
            } catch (error) {
                console.error(`测试 ${name} 连接失败:`, error.message);
                results[name] = false;
            }
        }

        return results;
    }

    /**
     * 添加新的通知器
     * @param {string} name - 通知器名称
     * @param {Object} notifier - 通知器实例
     */
    addNotifier(name, notifier) {
        this.notifiers[name] = notifier;
        console.log(`添加通知器: ${name}`);
    }

    /**
     * 移除通知器
     * @param {string} name - 通知器名称
     */
    removeNotifier(name) {
        if (this.notifiers[name]) {
            delete this.notifiers[name];
            console.log(`移除通知器: ${name}`);
        }
    }

    /**
     * 添加消息格式化器
     * @param {string} source - 监控源名称
     * @param {Object} formatter - 格式化器实例
     */
    addMessageFormatter(source, formatter) {
        this.messageFormatters[source] = formatter;
        console.log(`添加消息格式化器: ${source}`);
    }

    /**
     * 暂停通知发送
     */
    pauseNotifications() {
        this.isPaused = true;
        console.log('通知发送已暂停');
    }

    /**
     * 恢复通知发送
     */
    resumeNotifications() {
        this.isPaused = false;
        console.log('通知发送已恢复');
        
        // 处理暂停期间积累的队列
        if (this.notificationQueue.length > 0) {
            this.processNotificationQueue();
        }
    }

    /**
     * 发送系统通知
     * @param {string} type - 通知类型
     * @param {string} message - 消息内容
     * @param {Object} options - 发送选项
     * @returns {Promise<Object>} 发送结果
     */
    async sendSystemNotification(type, message, options = {}) {
        const systemMessage = `🔔 系统通知 [${type.toUpperCase()}]\n\n${message}\n\n时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
        
        const notificationId = await this.saveNotificationHistory('system', type, systemMessage);
        const result = await this.sendWithRetry(systemMessage, { ...options, priority: 'high' });
        
        if (notificationId) {
            await this.updateNotificationStatus(notificationId, result.success ? 'sent' : 'failed', result.error);
        }

        return result;
    }

    /**
     * 发送健康检查通知
     * @param {Object} healthStatus - 健康状态
     * @returns {Promise<Object>} 发送结果
     */
    async sendHealthCheckNotification(healthStatus) {
        const { healthy, unhealthyModules, totalModules } = healthStatus;
        
        if (healthy) {
            return { success: true, skipped: true, reason: '系统健康，无需通知' };
        }

        const message = `⚠️ 系统健康检查警告\n\n` +
                       `总模块数: ${totalModules}\n` +
                       `异常模块: ${unhealthyModules.length}\n` +
                       `异常列表: ${unhealthyModules.join(', ')}\n\n` +
                       `请及时检查系统状态！`;

        return await this.sendSystemNotification('health_check', message, { priority: 'urgent' });
    }

    /**
     * 发送错误报告通知
     * @param {Error} error - 错误对象
     * @param {string} context - 错误上下文
     * @returns {Promise<Object>} 发送结果
     */
    async sendErrorNotification(error, context = '') {
        const message = `❌ 系统错误报告\n\n` +
                       `错误信息: ${error.message}\n` +
                       `发生位置: ${context}\n` +
                       `错误堆栈: ${error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '无'}\n\n` +
                       `请及时处理！`;

        return await this.sendSystemNotification('error', message, { priority: 'urgent' });
    }

    /**
     * 获取通知器状态
     * @returns {Object} 通知器状态信息
     */
    getNotifierStatus() {
        const status = {
            totalNotifiers: Object.keys(this.notifiers).length,
            availableNotifiers: [],
            unavailableNotifiers: [],
            messageFormatters: Object.keys(this.messageFormatters),
            isPaused: this.isPaused || false,
            isProcessing: this.isProcessing
        };

        for (const [name, notifier] of Object.entries(this.notifiers)) {
            if (notifier && typeof notifier.send === 'function') {
                status.availableNotifiers.push(name);
            } else {
                status.unavailableNotifiers.push(name);
            }
        }

        return status;
    }

    /**
     * 强制处理所有待处理批次
     * @returns {Promise<Array>} 处理结果
     */
    async flushAllBatches() {
        const results = [];
        const batchKeys = Array.from(this.pendingBatches.keys());

        console.log(`强制处理 ${batchKeys.length} 个待处理批次`);

        for (const batchKey of batchKeys) {
            try {
                const result = await this.processBatch(batchKey);
                results.push({ batchKey, ...result });
            } catch (error) {
                console.error(`强制处理批次失败: ${batchKey}`, error);
                results.push({ batchKey, success: false, error: error.message });
            }
        }

        return results;
    }

    /**
     * 清理资源
     */
    async cleanup() {
        console.log('开始清理通知管理器资源...');

        // 处理所有待处理批次
        await this.flushAllBatches();

        // 处理剩余队列
        if (this.notificationQueue.length > 0) {
            console.log(`处理剩余 ${this.notificationQueue.length} 个队列项目`);
            await this.processNotificationQueue();
        }

        // 清理防刷屏记录
        this.throttleMap.clear();

        // 清理批次超时器
        for (const batch of this.pendingBatches.values()) {
            if (batch.timeout) {
                clearTimeout(batch.timeout);
            }
        }
        this.pendingBatches.clear();

        console.log('通知管理器资源清理完成');
    }

    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 钉钉通知器
 */
export class DingTalkNotifier {
    constructor(config) {
        this.accessToken = config.accessToken;
        this.retryAttempts = config.retryAttempts || 3;
        this.retryDelay = 1000;
    }

    /**
     * 发送消息
     * @param {string} message - 消息内容
     * @param {Object} options - 发送选项
     * @returns {Promise<Object>} 发送结果
     */
    async send(message, options = {}) {
        // 自动添加关键词 "." 如果消息中没有包含
        let finalMessage = message;
        if (!message.includes('.')) {
            finalMessage = `. ${message}`;
        }

        let lastError = null;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await fetch(`https://oapi.dingtalk.com/robot/send?access_token=${this.accessToken}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        msgtype: 'text',
                        text: {
                            content: finalMessage
                        },
                        at: options.at || {}
                    })
                });

                const result = await response.json();

                if (result.errcode === 0) {
                    return {
                        success: true,
                        attempt,
                        response: result
                    };
                } else {
                    throw new Error(`钉钉API错误: ${result.errmsg} (code: ${result.errcode})`);
                }

            } catch (error) {
                lastError = error;
                console.error(`钉钉通知发送失败 (尝试 ${attempt}/${this.retryAttempts}):`, error.message);

                if (attempt < this.retryAttempts) {
                    await this.sleep(this.retryDelay * attempt);
                }
            }
        }

        return {
            success: false,
            error: lastError.message,
            attempts: this.retryAttempts
        };
    }

    /**
     * 发送文本消息（兼容旧版本API）
     * @param {string} message - 消息内容
     * @param {string} keyword - 关键词（可选）
     * @param {boolean} addKeyword - 是否自动添加关键词
     * @param {Object} options - 发送选项
     * @returns {Promise<Object>} 发送结果
     */
    async sendTextMessage(message, keyword = '.', addKeyword = true, options = {}) {
        let finalMessage = message;

        if (addKeyword && keyword && !message.includes(keyword)) {
            finalMessage = `${keyword} ${message}`;
        }

        return await this.send(finalMessage, options);
    }

    /**
     * 测试连接
     * @returns {Promise<boolean>} 是否连接成功
     */
    async testConnection() {
        try {
            const result = await this.send('🔔 监控系统连接测试');
            return result.success;
        } catch (error) {
            console.error('钉钉连接测试失败:', error);
            return false;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Twitter消息格式化器
 */
export class TwitterMessageFormatter {
    format(tweet) {
        const beijingTime = this.formatBeijingTime(tweet.created_at || tweet.createdAt);
        const content = tweet.content || tweet.text || '无文本内容';
        const username = tweet.username || tweet.author;
        const displayName = tweet.displayName || tweet.author || username;

        return `📝 新推文：${content}

👤 ${displayName} (@${username})
🕒 ${beijingTime}
🔗 ${tweet.url}`;
    }

    /**
     * 格式化为北京时间
     */
    formatBeijingTime(dateString) {
        if (!dateString) return '未知时间';

        try {
            const date = new Date(dateString);
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Asia/Shanghai'
            }).replace(/\//g, '/').replace(/,/g, '');
        } catch (error) {
            return dateString;
        }
    }

    formatBatch(tweets) {
        const header = `📊 Twitter推文汇总 (${tweets.length}条)\n\n`;
        
        const items = tweets.map((tweet, index) => 
            `${index + 1}. @${tweet.username}: ${this.truncateText(tweet.content, 50)}\n` +
            `   时间: ${formatTimestamp(tweet.created_at || tweet.createdAt)}`
        ).join('\n\n');
        
        return header + items;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

/**
 * 币安公告格式化器
 */
export class BinanceMessageFormatter {
    constructor() {
        this.categoryEmojis = {
            'new_listing': '🆕',
            'trading_pair': '💱',
            'maintenance': '🔧',
            'activity': '🎉',
            'general': '📢'
        };
    }

    format(announcement) {
        // 使用你喜欢的格式：📢 公告：标题
        const title = announcement.title || '未知公告';
        const originalTitle = announcement.originalTitle || title;

        // 如果有原文且与翻译不同，则显示原文
        const showOriginal = originalTitle && originalTitle !== title;

        let message = `📢 公告：${title}`;

        if (showOriginal) {
            message += `\n\n📝 原文:\n${originalTitle}`;
        }

        message += `\n\n🏷️ 分类: ${announcement.category || '未分类'}`;
        message += `\n📅 发布时间: ${announcement.publishTime || '未知时间'}`;
        message += `\n🔗 查看详情: ${announcement.url || 'https://www.binance.com/en/support/announcement'}`;

        return message;
    }

    formatBatch(announcements) {
        const header = `📊 币安公告汇总 (${announcements.length}条)\n\n`;
        
        const items = announcements.map((ann, index) => 
            `${index + 1}. ${ann.title}\n` +
            `   类型: ${ann.category} | 时间: ${this.formatTime(ann.publishTime)}`
        ).join('\n\n');
        
        return header + items;
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    truncateContent(content, maxLength) {
        if (!content) return '';
        if (content.length <= maxLength) return content;
        return content.substring(0, maxLength) + '...';
    }
}

/**
 * 价格消息格式化器
 */
export class PriceMessageFormatter {
    constructor() {
        this.alertTypes = {
            'price_alert': '🚨',
            'daily_report': '📊'
        };
    }

    /**
     * 格式化价格预警消息
     */
    formatAlert(alertData) {
        const { symbol, changePercent, currentPrice, threshold, highPrice, lowPrice, volume } = alertData;

        const direction = changePercent > 0 ? '上涨' : '下跌';
        const icon = changePercent > 0 ? "🟢" : "🔴";
        const changeStr = changePercent > 0 ? `+${changePercent.toFixed(2)}` : changePercent.toFixed(2);

        // 简化币种名称显示（BTCUSDT -> BTC）
        const simplifiedSymbol = symbol.replace('USDT', '').replace('BTC', 'BTC').replace('ETH', 'ETH').replace('BNB', 'BNB');

        // 格式化价格显示
        const formattedPrice = this.formatPrice(currentPrice);

        let message = `${icon} 价格预警 ${simplifiedSymbol}: $${formattedPrice} (${changeStr}%)

📅 ${new Date().toLocaleDateString('zh-CN')} ${new Date().toLocaleTimeString('zh-CN', {hour12: false})}

⚠️ 触发${threshold}%阈值`;

        // 添加24小时数据（如果有）
        if (highPrice && lowPrice && volume) {
            message += `

📊 24小时数据:
📊 24h最高: $${this.formatPrice(highPrice)}
📊 24h最低: $${this.formatPrice(lowPrice)}
💹 24h成交量: ${this.formatVolume(volume)}`;
        }

        return message;
    }

    /**
     * 格式化每日报告
     */
    formatDailyReport(reportData) {
        const { symbols, stats, date } = reportData;

        // 构建第一行价格摘要
        const priceSummary = symbols.map(symbol => {
            const stat = stats[symbol];
            if (stat) {
                const simplifiedSymbol = symbol.replace('USDT', '');
                const price = parseFloat(stat.lastPrice);
                const formattedPrice = this.formatPrice(price);
                return `${simplifiedSymbol} $${formattedPrice}`;
            }
            return null;
        }).filter(Boolean).join(' | ');

        let message = `📊 每日价格报告：${priceSummary}\n\n`;
        message += `📅 ${date || new Date().toLocaleDateString('zh-CN')}\n\n`;

        for (const symbol of symbols) {
            const stat = stats[symbol];
            if (stat) {
                const change24h = parseFloat(stat.priceChangePercent);
                const changeIcon = change24h >= 0 ? '🟢' : '🔴';
                const changeStr = change24h >= 0 ? `+${change24h.toFixed(2)}` : change24h.toFixed(2);

                const simplifiedSymbol = symbol.replace('USDT', '');

                message += `${changeIcon} ${simplifiedSymbol}\n`;
                message += `💰 当前价格: $${this.formatPrice(parseFloat(stat.lastPrice))}\n`;
                message += `📊 24h变化: ${changeStr}%\n`;
                message += `📈 24h最高: $${this.formatPrice(parseFloat(stat.highPrice))}\n`;
                message += `📉 24h最低: $${this.formatPrice(parseFloat(stat.lowPrice))}\n`;
                message += `💹 24h成交量: ${this.formatVolume(parseFloat(stat.volume))}\n`;
                if (stat.threshold) {
                    message += `⚠️  预警阈值: ${stat.threshold}%\n`;
                }
                message += `\n`;
            }
        }

        message += `💡 提示: 各交易对价格变化超过对应阈值时会自动发送预警`;
        return message;
    }

    /**
     * 格式化价格显示（添加千分位分隔符）
     */
    formatPrice(price) {
        const num = parseFloat(price);
        if (num >= 1) {
            return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            return num.toFixed(8);
        }
    }

    /**
     * 格式化成交量
     */
    formatVolume(volume) {
        if (volume >= 1e9) {
            return (volume / 1e9).toFixed(2) + 'B';
        } else if (volume >= 1e6) {
            return (volume / 1e6).toFixed(2) + 'M';
        } else if (volume >= 1e3) {
            return (volume / 1e3).toFixed(2) + 'K';
        } else {
            return volume.toFixed(2);
        }
    }

    formatBatch(alerts) {
        const header = `📊 价格预警汇总 (${alerts.length}条)\n\n`;

        const items = alerts.map((alert, index) =>
            `${index + 1}. ${alert.symbol}: ${alert.changePercent > 0 ? '+' : ''}${alert.changePercent.toFixed(2)}%\n` +
            `   价格: $${this.formatPrice(alert.currentPrice)}`
        ).join('\n\n');

        return header + items;
    }
}

// 创建统一通知管理器的工厂函数
export function createUnifiedNotifier(config) {
    return new UnifiedNotifierManager(config);
}

// 为了向后兼容，导出DingTalkNotifier
export { DingTalkNotifier as dingdingNotifier };