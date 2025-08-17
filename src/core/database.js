/**
 * 统一数据库管理器
 * 支持多监控源的数据存储和管理
 */
import pg from 'pg';
const { Pool } = pg;
import { SchemaManager } from './schema-manager.js';
import { BinanceAnnouncementSchema } from '../monitors/binance-announcement/schema.js';
import { BinancePriceSchema } from '../monitors/binance-price/schema.js';
import { TwitterSharedSchema } from '../monitors/twitter/shared/schema.js';

export class UnifiedDatabaseManager {
    constructor() {
        this.pool = null;
        this.isInitialized = false;
        this.connectionConfig = null;
        this.schemaManager = new SchemaManager(this);

        // 注册模块表结构
        this.schemaManager.registerModuleSchema('binance-announcement', BinanceAnnouncementSchema);
        this.schemaManager.registerModuleSchema('binance-price', BinancePriceSchema);
        this.schemaManager.registerModuleSchema('twitter', TwitterSharedSchema);
    }

    /**
     * 初始化数据库连接
     * @param {Object} config - 数据库配置
     * @param {Array<string>} enabledModules - 启用的模块列表
     * @returns {Promise<boolean>} 是否初始化成功
     */
    async initialize(config = null, enabledModules = []) {
        try {
            if (config && config.url) {
                // 使用传入的配置
                this.connectionConfig = {
                    connectionString: config.url,
                    max: config.poolSize || parseInt(process.env.DB_POOL_SIZE || '10'),
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: config.timeout || parseInt(process.env.DB_TIMEOUT || '30000'),
                    ssl: { rejectUnauthorized: false } // Supabase需要SSL连接
                };
            } else {
                // 使用环境变量
                this.connectionConfig = {
                    connectionString: process.env.DATABASE_URL,
                    max: parseInt(process.env.DB_POOL_SIZE || '10'),
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT || '30000'),
                    ssl: { rejectUnauthorized: false } // Supabase需要SSL连接
                };
            }

            this.pool = new Pool(this.connectionConfig);

            // 测试连接
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            // 使用模块化表管理
            await this.initializeModularTables(enabledModules);

            this.isInitialized = true;
            console.log('✅ 统一数据库管理器初始化成功');
            return true;

        } catch (error) {
            console.error('❌ 数据库初始化失败:', error.message);
            console.error('错误详情:', error);
            return false;
        }
    }



    /**
     * 使用模块化方式初始化表结构
     * @param {Array<string>} enabledModules - 启用的模块列表
     */
    async initializeModularTables(enabledModules) {
        try {
            await this.schemaManager.initializeModuleTables(enabledModules);
            console.log('✅ 模块化表结构初始化完成');
        } catch (error) {
            console.error('❌ 模块化表结构初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 检查数据库连接健康状态
     * @returns {boolean} 是否健康
     */
    isHealthy() {
        return this.isInitialized && this.pool && !this.pool.ended;
    }

    /**
     * 确保数据库连接可用
     * @returns {Promise<boolean>} 连接是否可用
     */
    async ensureConnection() {
        if (!this.isHealthy()) {
            console.log('🔄 数据库连接不健康，尝试重新初始化...');
            return await this.initialize(this.connectionConfig);
        }

        try {
            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();
            return true;
        } catch (error) {
            console.error('🔄 数据库连接测试失败，尝试重新初始化:', error.message);
            return await this.initialize(this.connectionConfig);
        }
    }

    // ==================== 通知历史管理 ====================

    /**
     * 保存通知历史
     * @param {string} moduleName - 模块名称
     * @param {string} notificationType - 通知类型
     * @param {string} content - 通知内容
     * @param {string} recipient - 接收者
     * @returns {Promise<number|null>} 通知ID
     */
    async saveNotificationHistory(moduleName, notificationType, content, recipient = 'dingtalk') {
        if (!await this.ensureConnection()) return null;

        try {
            const query = `
                INSERT INTO notification_history 
                (module_name, notification_type, content, recipient, created_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                RETURNING id
            `;
            
            const result = await this.pool.query(query, [moduleName, notificationType, content, recipient]);
            return result.rows[0].id;
        } catch (error) {
            console.error('❌ 保存通知历史失败:', error.message);
            return null;
        }
    }

    /**
     * 更新通知状态
     * @param {number} notificationId - 通知ID
     * @param {string} status - 状态
     * @param {string} errorMessage - 错误信息
     */
    async updateNotificationStatus(notificationId, status, errorMessage = null) {
        if (!await this.ensureConnection()) return false;

        try {
            const query = `
                UPDATE notification_history 
                SET status = $2, 
                    sent_at = CASE WHEN $2 = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,
                    error_message = $3,
                    retry_count = CASE WHEN $2 = 'failed' THEN retry_count + 1 ELSE retry_count END
                WHERE id = $1
            `;
            
            await this.pool.query(query, [notificationId, status, errorMessage]);
            return true;
        } catch (error) {
            console.error('❌ 更新通知状态失败:', error.message);
            return false;
        }
    }

    // ==================== 系统指标管理 ====================

    /**
     * 记录系统指标
     * @param {string} moduleName - 模块名称
     * @param {string} metricName - 指标名称
     * @param {number} metricValue - 指标值
     * @param {string} metricUnit - 指标单位
     */
    async recordMetric(moduleName, metricName, metricValue, metricUnit = '') {
        if (!await this.ensureConnection()) return false;

        try {
            const query = `
                INSERT INTO system_metrics 
                (module_name, metric_name, metric_value, metric_unit, recorded_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            `;
            
            await this.pool.query(query, [moduleName, metricName, metricValue, metricUnit]);
            return true;
        } catch (error) {
            console.error('❌ 记录系统指标失败:', error.message);
            return false;
        }
    }

    // ==================== 兼容性方法 ====================

    /**
     * 获取refreshToken（Twitter兼容）
     * @param {string} username - 用户名
     * @returns {Promise<string|null>} refreshToken
     */
    async getRefreshToken(username) {
        if (!await this.ensureConnection()) return null;

        try {
            const result = await this.pool.query(
                'SELECT refresh_token FROM twitter_refresh_tokens WHERE username = $1',
                [username]
            );
            return result.rows.length > 0 ? result.rows[0].refresh_token : null;
        } catch (error) {
            console.error('❌ 获取refreshToken失败:', error.message);
            return null;
        }
    }

    /**
     * 保存refreshToken（Twitter兼容）
     * @param {string} username - 用户名
     * @param {string} refreshToken - refreshToken
     * @returns {Promise<boolean>} 是否保存成功
     */
    async saveRefreshToken(username, refreshToken) {
        if (!await this.ensureConnection()) return false;

        try {
            const query = `
                INSERT INTO twitter_refresh_tokens (username, refresh_token, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (username)
                DO UPDATE SET
                    refresh_token = $2,
                    updated_at = CURRENT_TIMESTAMP
            `;
            
            await this.pool.query(query, [username, refreshToken]);
            return true;
        } catch (error) {
            console.error('❌ 保存refreshToken失败:', error.message);
            return false;
        }
    }

    /**
     * 获取监控状态（兼容方法）
     * @param {string} monitorUser - 监控用户
     * @param {string} moduleName - 模块名称
     * @returns {Promise<Object|null>} 监控状态
     */
    async getMonitorState(monitorUser, moduleName = 'twitter') {
        if (!await this.ensureConnection()) return null;

        try {
            const result = await this.pool.query(
                'SELECT * FROM twitter_processed_records WHERE monitor_user = $1',
                [monitorUser]
            );
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('❌ 获取监控状态失败:', error.message);
            return null;
        }
    }

    /**
     * 更新监控状态（兼容方法）
     * @param {string} monitorUser - 监控用户
     * @param {string} moduleName - 模块名称
     * @param {Object} stateData - 状态数据
     * @returns {Promise<boolean>} 是否更新成功
     */
    async updateMonitorState(monitorUser, moduleName = 'twitter', stateData) {
        if (!await this.ensureConnection()) return false;

        try {
            const query = `
                INSERT INTO twitter_processed_records (monitor_user, user_id, last_check_time, created_at, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (monitor_user)
                DO UPDATE SET
                    user_id = COALESCE($2, twitter_processed_records.user_id),
                    last_check_time = $3,
                    updated_at = CURRENT_TIMESTAMP
            `;

            await this.pool.query(query, [
                monitorUser,
                stateData.user_id || null,
                stateData.last_check_time
            ]);
            return true;
        } catch (error) {
            console.error('❌ 更新监控状态失败:', error.message);
            return false;
        }
    }

    /**
     * 获取缓存的用户ID
     * @param {string} monitorUser - 监控用户名
     * @returns {Promise<string|null>} 用户ID
     */
    async getCachedUserId(monitorUser) {
        if (!await this.ensureConnection()) return null;

        try {
            const result = await this.pool.query(
                'SELECT user_id FROM twitter_processed_records WHERE monitor_user = $1 AND user_id IS NOT NULL',
                [monitorUser]
            );
            return result.rows.length > 0 ? result.rows[0].user_id : null;
        } catch (error) {
            console.error('❌ 获取缓存用户ID失败:', error.message);
            return null;
        }
    }

    /**
     * 缓存用户ID
     * @param {string} monitorUser - 监控用户名
     * @param {string} userId - Twitter用户ID
     * @returns {Promise<boolean>} 是否缓存成功
     */
    async cacheUserId(monitorUser, userId) {
        if (!await this.ensureConnection()) return false;

        try {
            const query = `
                INSERT INTO twitter_processed_records (monitor_user, user_id, created_at, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (monitor_user)
                DO UPDATE SET
                    user_id = $2,
                    updated_at = CURRENT_TIMESTAMP
            `;

            await this.pool.query(query, [monitorUser, userId]);
            console.log(`✅ 用户ID已缓存: ${monitorUser} -> ${userId}`);
            return true;
        } catch (error) {
            console.error('❌ 缓存用户ID失败:', error.message);
            return false;
        }
    }



    // ==================== 公告处理历史管理 ====================

    /**
     * 检查公告是否已经处理过
     * @param {string} announcementId - 公告唯一标识符
     * @param {string} moduleName - 模块名称
     * @returns {Promise<boolean>} 是否已处理过
     */
    async isAnnouncementProcessed(announcementId, moduleName = 'binance_websocket') {
        if (!await this.ensureConnection()) return false;

        try {
            const query = `
                SELECT id FROM binance_processed_records
                WHERE announcement_id = $1 AND module_name = $2
                LIMIT 1
            `;

            const result = await this.pool.query(query, [announcementId, moduleName]);
            return result.rowCount > 0;
        } catch (error) {
            console.error('❌ 检查公告处理状态失败:', error.message);
            return false;
        }
    }

    /**
     * 保存已处理的公告记录
     * @param {string} announcementId - 公告唯一标识符
     * @param {Object} announcementData - 公告数据
     * @param {string} moduleName - 模块名称
     * @returns {Promise<boolean>} 是否保存成功
     */
    async saveProcessedAnnouncement(announcementId, announcementData = {}, moduleName = 'binance_websocket') {
        if (!await this.ensureConnection()) return false;

        try {
            const query = `
                INSERT INTO binance_processed_records
                (announcement_id, title, catalog_name, publish_date, module_name)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (announcement_id) DO NOTHING
                RETURNING id
            `;

            const publishDate = announcementData.publishDate ?
                new Date(announcementData.publishDate) : null;

            const values = [
                announcementId,
                announcementData.title || null,
                announcementData.catalogName || null,
                publishDate,
                moduleName
            ];

            const result = await this.pool.query(query, values);
            return result.rowCount > 0;
        } catch (error) {
            console.error('❌ 保存已处理公告失败:', error.message);
            return false;
        }
    }

    /**
     * 获取最近处理的公告列表（用于启动时加载到内存缓存）
     * @param {string} moduleName - 模块名称
     * @param {number} hours - 获取最近几小时的记录，默认24小时
     * @returns {Promise<Array>} 公告ID列表
     */
    async getRecentProcessedAnnouncements(moduleName = 'binance_websocket', hours = 24) {
        if (!await this.ensureConnection()) return [];

        try {
            const query = `
                SELECT announcement_id
                FROM binance_processed_records
                WHERE module_name = $1
                AND processed_at > NOW() - INTERVAL '${hours} hours'
                ORDER BY processed_at DESC
            `;

            const result = await this.pool.query(query, [moduleName]);
            return result.rows.map(row => row.announcement_id);
        } catch (error) {
            console.error('❌ 获取最近处理公告失败:', error.message);
            return [];
        }
    }

    /**
     * 清理过期的公告处理记录
     * @param {number} days - 保留天数，默认30天
     * @returns {Promise<number>} 清理的记录数
     */
    async cleanupOldProcessedAnnouncements(days = 30) {
        if (!await this.ensureConnection()) return 0;

        try {
            const query = `
                DELETE FROM binance_processed_records
                WHERE processed_at < NOW() - INTERVAL '${days} days'
            `;

            const result = await this.pool.query(query);
            console.log(`🧹 清理了 ${result.rowCount} 条过期的公告处理记录`);
            return result.rowCount;
        } catch (error) {
            console.error('❌ 清理过期公告记录失败:', error.message);
            return 0;
        }
    }

    // ==================== 数据清理管理 ====================

    /**
     * 执行数据清理
     * @param {string} tableName - 表名（可选，不指定则清理所有表）
     * @returns {Promise<Object>} 清理结果
     */
    async performDataCleanup(tableName = null) {
        if (!await this.ensureConnection()) return { success: false, error: '数据库连接失败' };

        try {
            console.log('🧹 开始执行数据清理...');

            const client = await this.pool.connect();
            const cleanupResults = {};

            try {
                // 获取数据保留策略
                const policiesQuery = tableName 
                    ? 'SELECT * FROM data_retention_policies WHERE table_name = $1 AND enabled = true'
                    : 'SELECT * FROM data_retention_policies WHERE enabled = true';
                
                const policiesParams = tableName ? [tableName] : [];
                const policiesResult = await client.query(policiesQuery, policiesParams);

                for (const policy of policiesResult.rows) {
                    try {
                        const result = await this.cleanupTable(client, policy);
                        cleanupResults[policy.table_name] = result;
                    } catch (error) {
                        console.error(`清理表 ${policy.table_name} 失败:`, error.message);
                        cleanupResults[policy.table_name] = { 
                            success: false, 
                            error: error.message,
                            deletedRows: 0 
                        };
                    }
                }

                console.log('✅ 数据清理完成');
                return { success: true, results: cleanupResults };

            } finally {
                client.release();
            }

        } catch (error) {
            console.error('❌ 数据清理失败:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 清理单个表的过期数据
     * @param {Object} client - 数据库客户端
     * @param {Object} policy - 清理策略
     * @returns {Promise<Object>} 清理结果
     */
    async cleanupTable(client, policy) {
        const { table_name, retention_days } = policy;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retention_days);

        let deleteQuery;
        let countQuery;

        // 根据表名构建不同的删除查询
        switch (table_name) {

            case 'notification_history':
                deleteQuery = 'DELETE FROM notification_history WHERE created_at < $1';
                countQuery = 'SELECT COUNT(*) FROM notification_history WHERE created_at < $1';
                break;
            case 'system_metrics':
                deleteQuery = 'DELETE FROM system_metrics WHERE recorded_at < $1';
                countQuery = 'SELECT COUNT(*) FROM system_metrics WHERE recorded_at < $1';
                break;

            default:
                throw new Error(`不支持的表名: ${table_name}`);
        }

        // 先统计要删除的行数
        const countResult = await client.query(countQuery, [cutoffDate]);
        const rowsToDelete = parseInt(countResult.rows[0].count);

        if (rowsToDelete === 0) {
            console.log(`表 ${table_name}: 没有需要清理的数据`);
            return { success: true, deletedRows: 0 };
        }

        // 执行删除
        const deleteResult = await client.query(deleteQuery, [cutoffDate]);
        const deletedRows = deleteResult.rowCount;

        // 更新清理记录
        await client.query(
            'UPDATE data_retention_policies SET last_cleanup = CURRENT_TIMESTAMP WHERE table_name = $1',
            [table_name]
        );

        console.log(`表 ${table_name}: 清理了 ${deletedRows} 行数据 (保留期: ${retention_days} 天)`);
        
        return { success: true, deletedRows };
    }

    /**
     * 获取数据保留策略
     * @returns {Promise<Array>} 保留策略列表
     */
    async getDataRetentionPolicies() {
        if (!await this.ensureConnection()) return [];

        try {
            const result = await this.pool.query('SELECT * FROM data_retention_policies ORDER BY table_name');
            return result.rows;
        } catch (error) {
            console.error('❌ 获取数据保留策略失败:', error.message);
            return [];
        }
    }

    /**
     * 更新数据保留策略
     * @param {string} tableName - 表名
     * @param {number} retentionDays - 保留天数
     * @param {boolean} enabled - 是否启用
     * @returns {Promise<boolean>} 是否更新成功
     */
    async updateDataRetentionPolicy(tableName, retentionDays, enabled = true) {
        if (!await this.ensureConnection()) return false;

        try {
            const query = `
                UPDATE data_retention_policies 
                SET retention_days = $2, enabled = $3, updated_at = CURRENT_TIMESTAMP
                WHERE table_name = $1
            `;
            
            const result = await this.pool.query(query, [tableName, retentionDays, enabled]);
            
            if (result.rowCount === 0) {
                // 如果策略不存在，则创建新的
                await this.pool.query(
                    'INSERT INTO data_retention_policies (table_name, retention_days, enabled) VALUES ($1, $2, $3)',
                    [tableName, retentionDays, enabled]
                );
            }

            console.log(`✅ 更新数据保留策略: ${tableName} = ${retentionDays} 天`);
            return true;
        } catch (error) {
            console.error('❌ 更新数据保留策略失败:', error.message);
            return false;
        }
    }

    /**
     * 获取数据库统计信息
     * @returns {Promise<Object>} 统计信息
     */
    async getDatabaseStatistics() {
        if (!await this.ensureConnection()) return null;

        try {
            const client = await this.pool.connect();
            const stats = {};

            try {
                // 获取各表的行数和大小
                const tables = [
                    'monitor_modules',
                    'twitter_processed_records',
                    'binance_processed_records',
                    'notification_history',
                    'system_metrics',
                    'twitter_refresh_tokens'
                ];

                for (const tableName of tables) {
                    try {
                        // 获取行数
                        const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
                        const rowCount = parseInt(countResult.rows[0].count);

                        // 获取表大小
                        const sizeResult = await client.query(`
                            SELECT pg_size_pretty(pg_total_relation_size($1)) as size
                        `, [tableName]);
                        const tableSize = sizeResult.rows[0].size;

                        stats[tableName] = {
                            rowCount,
                            size: tableSize
                        };
                    } catch (error) {
                        console.warn(`获取表 ${tableName} 统计信息失败:`, error.message);
                        stats[tableName] = { rowCount: 0, size: '0 bytes' };
                    }
                }

                // 获取数据库总大小
                const dbSizeResult = await client.query(`
                    SELECT pg_size_pretty(pg_database_size(current_database())) as total_size
                `);
                stats.totalSize = dbSizeResult.rows[0].total_size;

                // 获取连接池状态
                stats.connectionPool = {
                    totalConnections: this.pool.totalCount,
                    idleConnections: this.pool.idleCount,
                    waitingClients: this.pool.waitingCount
                };

                return stats;

            } finally {
                client.release();
            }

        } catch (error) {
            console.error('❌ 获取数据库统计信息失败:', error.message);
            return null;
        }
    }

    /**
     * 优化数据库性能
     * @returns {Promise<boolean>} 是否优化成功
     */
    async optimizeDatabase() {
        if (!await this.ensureConnection()) return false;

        try {
            console.log('🔧 开始数据库性能优化...');

            const client = await this.pool.connect();

            try {
                // 更新表统计信息
                await client.query('ANALYZE');
                console.log('✅ 表统计信息已更新');

                // 清理死元组（如果是超级用户）
                try {
                    await client.query('VACUUM');
                    console.log('✅ 死元组清理完成');
                } catch (error) {
                    console.warn('⚠️ 无法执行VACUUM（可能需要超级用户权限）');
                }

                // 重建索引（如果需要）
                const indexMaintenanceQueries = [
                    'REINDEX INDEX idx_notification_history_module',
                    'REINDEX INDEX idx_system_metrics_module'
                ];

                for (const query of indexMaintenanceQueries) {
                    try {
                        await client.query(query);
                    } catch (error) {
                        console.warn(`索引维护失败: ${query}`, error.message);
                    }
                }

                console.log('✅ 数据库性能优化完成');
                return true;

            } finally {
                client.release();
            }

        } catch (error) {
            console.error('❌ 数据库性能优化失败:', error.message);
            return false;
        }
    }

    /**
     * 关闭数据库连接
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isInitialized = false;
            console.log('✅ 数据库连接已关闭');
        }
    }
}

// 创建统一数据库管理器实例
export const unifiedDatabaseManager = new UnifiedDatabaseManager();

// 为了向后兼容，导出原有的databaseManager
export const databaseManager = unifiedDatabaseManager;