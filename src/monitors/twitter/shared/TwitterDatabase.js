/**
 * Twitter数据库操作基类
 * 提供数据库连接和数据迁移功能
 * 表结构定义已移至 TwitterSharedSchema
 */
import { unifiedDatabaseManager } from '../../../core/database.js';

export class TwitterDatabase {
    constructor() {
        this.db = unifiedDatabaseManager;
    }

    /**
     * 初始化Twitter相关表（已移至共享schema）
     * @deprecated 使用 TwitterSharedSchema.initializeTables() 代替
     */
    async initializeTables() {
        console.log('⚠️  TwitterDatabase.initializeTables() 已废弃，请使用 TwitterSharedSchema.initializeTables()');
        // 表结构初始化已移至 src/monitors/twitter/shared/schema.js
        // 由统一数据库管理器自动调用
    }

    /**
     * 迁移现有数据
     */
    async migrateExistingData() {
        try {
            if (!await this.db.ensureConnection()) {
                console.warn('⚠️  数据库连接失败，跳过数据迁移');
                return;
            }

            // 检查是否存在旧表 (PostgreSQL语法)
            const result = await this.db.pool.query(`
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'twitter_refresh_tokens'
            `);

            if (result.rows.length > 0) {
                console.log('🔄 迁移现有Twitter凭证数据...');

                // 迁移数据 (PostgreSQL语法)
                await this.db.pool.query(`
                    INSERT INTO twitter_credentials
                    (username, refresh_token, created_at, updated_at)
                    SELECT username, refresh_token, created_at, updated_at
                    FROM twitter_refresh_tokens
                    ON CONFLICT (username) DO NOTHING
                `);

                // 重命名旧表作为备份
                await this.db.pool.query(`
                    ALTER TABLE twitter_refresh_tokens
                    RENAME TO twitter_refresh_tokens_backup
                `);

                console.log('✅ 数据迁移完成');
            } else {
                console.log('ℹ️  没有发现需要迁移的旧数据');
            }
        } catch (error) {
            console.warn('⚠️  数据迁移失败:', error.message);
        }
    }
}
