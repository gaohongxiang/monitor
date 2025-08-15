/**
 * Binance价格监控模块数据库表结构
 */

export class BinancePriceSchema {
    /**
     * 获取Binance价格监控模块的表定义
     * @returns {Array} 表定义数组
     */
    static getTables() {
        // 简化版本：不使用数据库表，只用内存缓存
        // 重启后价格缓存会重新初始化，这样更简单
        return [
            // 如果需要持久化数据，可以取消注释以下表定义
            /*
            {
                name: 'price_alerts',
                sql: `
                    CREATE TABLE IF NOT EXISTS price_alerts (
                        id SERIAL PRIMARY KEY,
                        symbol VARCHAR(20) NOT NULL,
                        alert_type VARCHAR(20) NOT NULL, -- 'price_change', 'volume_spike', etc.
                        threshold_value DECIMAL(20, 8) NOT NULL,
                        current_price DECIMAL(20, 8),
                        change_percent DECIMAL(5, 2),
                        triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        is_processed BOOLEAN DEFAULT FALSE,
                        module_name VARCHAR(50) DEFAULT 'binance_price'
                    )
                `,
                indexes: [
                    `CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol 
                     ON price_alerts (symbol, triggered_at)`,
                    `CREATE INDEX IF NOT EXISTS idx_price_alerts_processed 
                     ON price_alerts (is_processed, triggered_at)`,
                    `CREATE INDEX IF NOT EXISTS idx_price_alerts_type 
                     ON price_alerts (alert_type, triggered_at)`
                ]
            },
            {
                name: 'daily_price_reports',
                sql: `
                    CREATE TABLE IF NOT EXISTS daily_price_reports (
                        id SERIAL PRIMARY KEY,
                        symbol VARCHAR(20) NOT NULL,
                        current_price DECIMAL(20, 8) NOT NULL,
                        change_24h DECIMAL(5, 2),
                        high_24h DECIMAL(20, 8),
                        low_24h DECIMAL(20, 8),
                        volume_24h VARCHAR(20),
                        report_date DATE DEFAULT CURRENT_DATE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        module_name VARCHAR(50) DEFAULT 'binance_price'
                    )
                `,
                indexes: [
                    `CREATE INDEX IF NOT EXISTS idx_daily_reports_symbol
                     ON daily_price_reports (symbol, report_date)`,
                    `CREATE INDEX IF NOT EXISTS idx_daily_reports_date
                     ON daily_price_reports (report_date)`
                ]
            },
            {
                name: 'price_history',
                sql: `
                    CREATE TABLE IF NOT EXISTS price_history (
                        id SERIAL PRIMARY KEY,
                        symbol VARCHAR(20) NOT NULL,
                        price DECIMAL(20, 8) NOT NULL,
                        volume DECIMAL(20, 8),
                        change_24h DECIMAL(5, 2),
                        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        module_name VARCHAR(50) DEFAULT 'binance_price'
                    )
                `,
                indexes: [
                    `CREATE INDEX IF NOT EXISTS idx_price_history_symbol 
                     ON price_history (symbol, recorded_at)`,
                    `CREATE INDEX IF NOT EXISTS idx_price_history_time 
                     ON price_history (recorded_at)`
                ]
            }
            */
        ];
    }

    /**
     * 初始化Binance价格监控模块的表结构
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
        
        console.log('✅ Binance价格监控模块表结构初始化完成');
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
    static async cleanupOldData(client, daysToKeep = 7) {
        console.log(`🧹 清理 ${daysToKeep} 天前的价格监控数据...`);
        
        // 清理旧的价格历史记录
        const historyResult = await client.query(`
            DELETE FROM price_history 
            WHERE recorded_at < NOW() - INTERVAL '${daysToKeep} days'
        `);
        
        // 清理已处理的价格预警
        const alertsResult = await client.query(`
            DELETE FROM price_alerts 
            WHERE is_processed = true AND triggered_at < NOW() - INTERVAL '${daysToKeep} days'
        `);
        
        console.log(`✅ 已清理 ${historyResult.rowCount} 条价格历史记录`);
        console.log(`✅ 已清理 ${alertsResult.rowCount} 条价格预警记录`);
        
        return historyResult.rowCount + alertsResult.rowCount;
    }
}
