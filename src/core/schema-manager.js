/**
 * 数据库表结构管理器
 * 支持模块化的表管理
 */

export class SchemaManager {
    constructor(databaseManager) {
        this.db = databaseManager;
        this.moduleSchemas = new Map();
    }

    /**
     * 注册模块的表结构
     * @param {string} moduleName - 模块名称
     * @param {Object} schemaClass - 表结构类
     */
    registerModuleSchema(moduleName, schemaClass) {
        this.moduleSchemas.set(moduleName, schemaClass);
        console.log(`📋 注册模块表结构: ${moduleName}`);
    }

    /**
     * 初始化所有已注册模块的表结构
     * @param {Array<string>} enabledModules - 启用的模块列表
     */
    async initializeModuleTables(enabledModules) {
        if (!this.db.pool) {
            throw new Error('数据库连接池未初始化');
        }

        const client = await this.db.pool.connect();
        
        try {
            await client.query('BEGIN');

            // 创建共享表（通知历史等）
            await this.createSharedTables(client);

            // 为每个启用的模块创建表
            for (const moduleName of enabledModules) {
                const schemaClass = this.moduleSchemas.get(moduleName);
                if (schemaClass) {
                    console.log(`📋 初始化模块 ${moduleName} 的表结构...`);
                    await schemaClass.initializeTables(client);
                } else {
                    console.warn(`⚠️  模块 ${moduleName} 没有注册表结构`);
                }
            }

            await client.query('COMMIT');
            console.log('✅ 所有模块表结构初始化完成');

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ 表结构初始化失败:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * 创建共享表（所有模块都可能用到的表）
     * @param {Object} client - 数据库客户端
     */
    async createSharedTables(client) {
        console.log('📋 创建共享表...');

        // 通知历史表
        await client.query(`
            CREATE TABLE IF NOT EXISTS notification_history (
                id SERIAL PRIMARY KEY,
                module_name VARCHAR(50) NOT NULL,
                notification_type VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                recipient VARCHAR(100) DEFAULT 'dingtalk',
                status VARCHAR(20) DEFAULT 'sent',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建索引
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_notification_history_module
            ON notification_history(module_name, created_at)
        `);

        console.log('✅ 共享表创建完成');
    }

    /**
     * 检查模块表是否存在
     * @param {string} moduleName - 模块名称
     * @returns {boolean} 表是否存在
     */
    async moduleTablesExist(moduleName) {
        const schemaClass = this.moduleSchemas.get(moduleName);
        if (!schemaClass) {
            return false;
        }

        const client = await this.db.pool.connect();
        try {
            return await schemaClass.tablesExist(client);
        } finally {
            client.release();
        }
    }

    /**
     * 清理所有模块的旧数据
     * @param {Array<string>} enabledModules - 启用的模块列表
     * @param {Object} cleanupConfig - 清理配置
     */
    async cleanupOldData(enabledModules, cleanupConfig = {}) {
        const client = await this.db.pool.connect();
        
        try {
            console.log('🧹 开始清理旧数据...');

            // 清理共享表
            await this.cleanupSharedTables(client, cleanupConfig.notification || 7);

            // 清理各模块的表
            for (const moduleName of enabledModules) {
                const schemaClass = this.moduleSchemas.get(moduleName);
                if (schemaClass && schemaClass.cleanupOldData) {
                    const daysToKeep = cleanupConfig[moduleName] || 30;
                    await schemaClass.cleanupOldData(client, daysToKeep);
                }
            }

            console.log('✅ 旧数据清理完成');

        } catch (error) {
            console.error('❌ 数据清理失败:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * 清理共享表的旧数据
     * @param {Object} client - 数据库客户端
     * @param {number} daysToKeep - 保留天数
     */
    async cleanupSharedTables(client, daysToKeep = 7) {
        console.log(`🧹 清理 ${daysToKeep} 天前的通知历史...`);
        
        const result = await client.query(`
            DELETE FROM notification_history 
            WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
        `);
        
        console.log(`✅ 已清理 ${result.rowCount} 条通知历史记录`);
        return result.rowCount;
    }

    /**
     * 获取数据库统计信息
     * @param {Array<string>} enabledModules - 启用的模块列表
     * @returns {Object} 统计信息
     */
    async getDatabaseStats(enabledModules) {
        const client = await this.db.pool.connect();
        const stats = {};
        
        try {
            // 获取共享表统计
            stats.shared = await this.getTableStats(client, ['notification_history']);

            // 获取各模块表统计
            for (const moduleName of enabledModules) {
                const schemaClass = this.moduleSchemas.get(moduleName);
                if (schemaClass) {
                    const tables = schemaClass.getTables();
                    const tableNames = tables.map(t => t.name);
                    stats[moduleName] = await this.getTableStats(client, tableNames);
                }
            }

            return stats;

        } finally {
            client.release();
        }
    }

    /**
     * 获取表统计信息
     * @param {Object} client - 数据库客户端
     * @param {Array<string>} tableNames - 表名列表
     * @returns {Object} 统计信息
     */
    async getTableStats(client, tableNames) {
        const stats = {};

        for (const tableName of tableNames) {
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

        return stats;
    }
}
