/**
 * Binance公告监控模块数据库表结构
 */

export class BinanceAnnouncementSchema {
    /**
     * 获取Binance公告监控模块的表定义
     * @returns {Array} 表定义数组
     */
    static getTables() {
        return [
            {
                name: 'binance_processed_records',
                sql: `
                    CREATE TABLE IF NOT EXISTS binance_processed_records (
                        id SERIAL PRIMARY KEY,
                        announcement_id VARCHAR(255) NOT NULL UNIQUE,
                        title TEXT,
                        catalog_name VARCHAR(100),
                        publish_date TIMESTAMP,
                        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        module_name VARCHAR(50) DEFAULT 'binance_announcement'
                    )
                `,
                indexes: [
                    `CREATE INDEX IF NOT EXISTS idx_binance_processed_records_id
                     ON binance_processed_records (announcement_id)`,
                    `CREATE INDEX IF NOT EXISTS idx_binance_processed_records_processed_at
                     ON binance_processed_records (processed_at)`
                ]
            }
        ];
    }

    /**
     * 初始化Binance模块的表结构
     * @param {Object} client - 数据库客户端
     */
    static async initializeTables(client) {
        const tables = this.getTables();
        
        for (const table of tables) {
            console.log(`📋 创建表: ${table.name}`);
            
            // 创建表
            await client.query(table.sql);
            
            // 创建索引
            if (table.indexes) {
                for (const indexSql of table.indexes) {
                    await client.query(indexSql);
                }
            }
        }
        
        console.log('✅ Binance公告监控模块表结构初始化完成');
    }

    /**
     * 检查表是否存在
     * @param {Object} client - 数据库客户端
     * @returns {boolean} 表是否存在
     */
    static async tablesExist(client) {
        const tables = this.getTables();
        
        for (const table of tables) {
            const result = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = $1
                )
            `, [table.name]);
            
            if (!result.rows[0].exists) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * 清理旧数据
     * @param {Object} client - 数据库客户端
     * @param {number} daysToKeep - 保留天数
     */
    static async cleanupOldData(client, daysToKeep = 30) {
        console.log(`🧹 清理 ${daysToKeep} 天前的Binance公告记录...`);
        
        const result = await client.query(`
            DELETE FROM binance_processed_records
            WHERE processed_at < NOW() - INTERVAL '${daysToKeep} days'
        `);
        
        console.log(`✅ 已清理 ${result.rowCount} 条旧记录`);
        return result.rowCount;
    }
}
