/**
 * Twitter记录管理器
 * 统一管理两个模块的处理记录
 */
import { TwitterDatabase } from './TwitterDatabase.js';

export class TwitterRecordsManager extends TwitterDatabase {
    constructor() {
        super();
    }

    /**
     * 标记记录为已处理
     */
    async markAsProcessed(source, username, recordId, recordType, data = null) {
        if (!await this.db.ensureConnection()) return false;

        try {
            await this.db.pool.query(`
                INSERT INTO twitter_processed_records
                (source, username, record_id, record_type, data, processed_at)
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (source, username, record_id)
                DO UPDATE SET
                    record_type = EXCLUDED.record_type,
                    data = EXCLUDED.data,
                    processed_at = CURRENT_TIMESTAMP
            `, [
                source,
                username,
                recordId,
                recordType,
                data ? JSON.stringify(data) : null
            ]);

            return true;
        } catch (error) {
            console.error('❌ 标记记录为已处理失败:', error.message);
            return false;
        }
    }

    /**
     * 检查记录是否已处理
     */
    async isProcessed(source, username, recordId) {
        if (!await this.db.ensureConnection()) return false;

        try {
            const result = await this.db.pool.query(`
                SELECT id FROM twitter_processed_records
                WHERE source = $1 AND username = $2 AND record_id = $3
            `, [source, username, recordId]);

            return result.rows.length > 0;
        } catch (error) {
            console.error('❌ 检查记录处理状态失败:', error.message);
            return false;
        }
    }

    /**
     * 获取最后处理的记录ID
     */
    async getLastProcessedId(source, username, recordType = null) {
        if (!await this.db.ensureConnection()) return null;

        try {
            let query = `
                SELECT record_id FROM twitter_processed_records
                WHERE source = $1 AND username = $2
            `;
            const params = [source, username];

            if (recordType) {
                query += ` AND record_type = $3`;
                params.push(recordType);
            }

            query += ` ORDER BY processed_at DESC LIMIT 1`;

            const result = await this.db.pool.query(query, params);
            return result.rows[0]?.record_id || null;
        } catch (error) {
            console.error('❌ 获取最后处理记录ID失败:', error.message);
            return null;
        }
    }

    /**
     * 获取处理记录统计
     */
    async getProcessedStats(source, username) {
        const result = await this.db.get(`
            SELECT 
                COUNT(*) as total_processed,
                COUNT(DISTINCT record_type) as types_count,
                MAX(processed_at) as last_processed_at
            FROM twitter_processed_records 
            WHERE source = ? AND username = ?
        `, [source, username]);

        return result;
    }

    /**
     * 清理旧记录（保留最近30天）
     */
    async cleanupOldRecords(daysToKeep = 30) {
        const result = await this.db.run(`
            DELETE FROM twitter_processed_records 
            WHERE processed_at < datetime('now', '-${daysToKeep} days')
        `);

        return result.changes;
    }

    /**
     * 获取用户的所有处理记录
     */
    async getUserRecords(source, username, limit = 100) {
        const results = await this.db.all(`
            SELECT * FROM twitter_processed_records
            WHERE source = ? AND username = ?
            ORDER BY processed_at DESC
            LIMIT ?
        `, [source, username, limit]);

        return results.map(record => ({
            ...record,
            data: record.data ? JSON.parse(record.data) : null
        }));
    }

    /**
     * 获取最后推文ID（使用现有表结构）
     */
    async getLastTweetId(monitorUser) {
        if (!await this.db.ensureConnection()) return null;

        try {
            const result = await this.db.pool.query(`
                SELECT last_tweet_id, last_check_time, user_id
                FROM twitter_processed_records
                WHERE monitor_user = $1
            `, [monitorUser]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ 获取最后推文ID失败:', error.message);
            return null;
        }
    }

    /**
     * 更新最后推文ID（使用现有表结构）
     */
    async updateLastTweetId(monitorUser, tweetId) {
        if (!await this.db.ensureConnection()) return false;

        try {
            await this.db.pool.query(`
                INSERT INTO twitter_processed_records
                (monitor_user, last_tweet_id, last_check_time, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (monitor_user)
                DO UPDATE SET
                    last_tweet_id = EXCLUDED.last_tweet_id,
                    last_check_time = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
            `, [monitorUser, tweetId]);

            return true;
        } catch (error) {
            console.error('❌ 更新最后推文ID失败:', error.message);
            return false;
        }
    }
}
