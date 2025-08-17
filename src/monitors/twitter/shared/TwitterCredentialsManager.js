/**
 * Twitter凭证管理器
 * 统一管理官方API和OpenAPI的凭证
 */
import { TwitterDatabase } from './TwitterDatabase.js';

export class TwitterCredentialsManager extends TwitterDatabase {
    constructor() {
        super();
    }

    /**
     * 获取官方API凭证
     */
    async getOfficialCredentials(username) {
        if (!await this.db.ensureConnection()) return null;

        try {
            const result = await this.db.pool.query(`
                SELECT username, refresh_token
                FROM twitter_credentials
                WHERE username = $1
            `, [username]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ 获取官方API凭证失败:', error.message);
            return null;
        }
    }

    /**
     * 更新官方API凭证
     */
    async updateOfficialCredentials(username, tokens) {
        if (!await this.db.ensureConnection()) return false;

        try {
            await this.db.pool.query(`
                INSERT INTO twitter_credentials
                (username, refresh_token, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (username)
                DO UPDATE SET
                    refresh_token = EXCLUDED.refresh_token,
                    updated_at = CURRENT_TIMESTAMP
            `, [username, tokens.refresh_token]);

            return true;
        } catch (error) {
            console.error('❌ 更新官方API凭证失败:', error.message);
            return false;
        }
    }

    /**
     * 获取OpenAPI凭证
     */
    async getOpenApiCredentials(username) {
        if (!await this.db.ensureConnection()) return null;

        try {
            const result = await this.db.pool.query(`
                SELECT username, openapi_auth_token, openapi_ct0_token, openapi_ct0_updated_at
                FROM twitter_credentials
                WHERE username = $1
            `, [username]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ 获取OpenAPI凭证失败:', error.message);
            return null;
        }
    }

    /**
     * 更新OpenAPI凭证
     */
    async updateOpenApiCredentials(username, tokens) {
        if (!await this.db.ensureConnection()) return false;

        try {
            await this.db.pool.query(`
                INSERT INTO twitter_credentials
                (username, openapi_auth_token, openapi_ct0_token, openapi_ct0_updated_at, updated_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (username)
                DO UPDATE SET
                    openapi_auth_token = EXCLUDED.openapi_auth_token,
                    openapi_ct0_token = EXCLUDED.openapi_ct0_token,
                    openapi_ct0_updated_at = EXCLUDED.openapi_ct0_updated_at,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                username,
                tokens.auth_token,
                tokens.ct0_token,
                tokens.ct0_updated_at || new Date().toISOString()
            ]);

            return true;
        } catch (error) {
            console.error('❌ 更新OpenAPI凭证失败:', error.message);
            return false;
        }
    }

    /**
     * 更新ct0令牌
     */
    async updateCt0Token(username, ct0Token) {
        if (!await this.db.ensureConnection()) return false;

        try {
            await this.db.pool.query(`
                UPDATE twitter_credentials
                SET openapi_ct0_token = $1,
                    openapi_ct0_updated_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE username = $2
            `, [ct0Token, username]);

            return true;
        } catch (error) {
            console.error('❌ 更新ct0令牌失败:', error.message);
            return false;
        }
    }

    /**
     * 获取所有凭证
     */
    async getAllCredentials(username) {
        if (!await this.db.ensureConnection()) return null;

        try {
            const result = await this.db.pool.query(`
                SELECT * FROM twitter_credentials
                WHERE username = $1
            `, [username]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('❌ 获取所有凭证失败:', error.message);
            return null;
        }
    }

    /**
     * 获取所有有OpenAPI凭证的用户
     */
    async getAvailableOpenApiUsers() {
        if (!await this.db.ensureConnection()) return [];

        try {
            const result = await this.db.pool.query(`
                SELECT username, openapi_ct0_updated_at,
                       CASE
                           WHEN openapi_ct0_updated_at IS NULL THEN false
                           WHEN openapi_ct0_updated_at < NOW() - INTERVAL '20 hours' THEN false
                           ELSE true
                       END as is_fresh
                FROM twitter_credentials
                WHERE openapi_auth_token IS NOT NULL
                  AND openapi_ct0_token IS NOT NULL
                ORDER BY is_fresh DESC, openapi_ct0_updated_at DESC
            `);

            return result.rows.map(row => ({
                username: row.username,
                isFresh: row.is_fresh,
                lastUpdate: row.openapi_ct0_updated_at
            }));
        } catch (error) {
            console.error('❌ 获取可用OpenAPI用户失败:', error.message);
            return [];
        }
    }

    /**
     * 检查ct0是否需要刷新（超过20小时）
     */
    async needsCt0Refresh(username) {
        if (!await this.db.ensureConnection()) return true;

        try {
            const result = await this.db.pool.query(`
                SELECT openapi_ct0_updated_at
                FROM twitter_credentials
                WHERE username = $1
            `, [username]);

            if (!result.rows[0] || !result.rows[0].openapi_ct0_updated_at) {
                return true;
            }

            const lastUpdate = new Date(result.rows[0].openapi_ct0_updated_at);
            const now = new Date();
            const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

            return hoursSinceUpdate > 20;
        } catch (error) {
            console.error('❌ 检查ct0刷新状态失败:', error.message);
            return true;
        }
    }


}
