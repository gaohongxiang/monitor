/**
 * Twitter监控模块数据库表结构
 */

export class TwitterSchema {
    /**
     * 获取Twitter模块的表定义
     * @returns {Array} 表定义数组
     */
    static getTables() {
        return [
            {
                name: 'twitter_refresh_tokens',
                sql: `
                    CREATE TABLE IF NOT EXISTS twitter_refresh_tokens (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(255) UNIQUE NOT NULL,
                        refresh_token TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `,
                indexes: [
                    `CREATE INDEX IF NOT EXISTS idx_twitter_refresh_tokens_username
                     ON twitter_refresh_tokens (username)`
                ]
            },
            {
                name: 'twitter_processed_records',
                sql: `
                    CREATE TABLE IF NOT EXISTS twitter_processed_records (
                        id SERIAL PRIMARY KEY,
                        monitor_user VARCHAR(255) NOT NULL,
                        user_id VARCHAR(50),
                        last_tweet_id VARCHAR(50),
                        last_check_time TIMESTAMP,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `,
                indexes: [
                    `CREATE INDEX IF NOT EXISTS idx_twitter_processed_records_user
                     ON twitter_processed_records (monitor_user)`,
                    `CREATE INDEX IF NOT EXISTS idx_twitter_processed_records_active
                     ON twitter_processed_records (is_active, last_check_time)`
                ]
            }
        ];
    }

    /**
     * 初始化Twitter模块的表结构
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
        
        console.log('✅ Twitter模块表结构初始化完成');
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
        console.log(`🧹 清理 ${daysToKeep} 天前的Twitter数据...`);

        // 清理旧的处理记录（保留活跃用户的记录）
        const recordsResult = await client.query(`
            DELETE FROM twitter_processed_records
            WHERE updated_at < NOW() - INTERVAL '${daysToKeep * 2} days'
            AND is_active = false
        `);

        console.log(`✅ 已清理 ${recordsResult.rowCount} 条旧处理记录`);
        return recordsResult.rowCount;
    }
}
