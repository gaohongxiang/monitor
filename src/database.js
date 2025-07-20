import pkg from 'pg';
const { Pool } = pkg;

/**
 * 数据库管理器
 * 负责PostgreSQL连接管理和基础操作
 */
export class DatabaseManager {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    /**
     * 初始化数据库连接
     * @returns {Promise<boolean>} 是否连接成功
     */
    async initialize() {
        try {
            // 获取环境特定的数据库URL
            const databaseUrl = this.getEnvironmentSpecificDatabaseUrl();
            if (!databaseUrl) {
                throw new Error('未找到适用于当前环境的数据库连接URL');
            }

            const nodeEnv = process.env.NODE_ENV || 'development';
            console.log(`🔗 初始化数据库连接 [环境: ${nodeEnv}]`);

            // 根据环境配置连接池参数
            const poolConfig = this.getEnvironmentSpecificPoolConfig(databaseUrl);

            // 创建连接池
            this.pool = new Pool(poolConfig);

            // 添加连接池事件监听
            this.setupPoolEventListeners();

            // 测试连接
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW(), current_database() as db_name');
            client.release();

            this.isConnected = true;
            console.log(`✅ 数据库连接成功 [环境: ${nodeEnv}] [数据库: ${result.rows[0].db_name}]`);

            // 初始化表结构
            await this.initializeTables();

            return true;
        } catch (error) {
            console.error('❌ 数据库连接失败:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * 设置连接池事件监听
     */
    setupPoolEventListeners() {
        if (!this.pool) return;

        // 监听连接错误
        this.pool.on('error', (err) => {
            const now = new Date().toISOString();
            console.error(`❌ [${now}] 数据库连接池错误:`, err.message);
            console.error(`🔍 错误详情:`, {
                code: err.code,
                errno: err.errno,
                syscall: err.syscall,
                address: err.address,
                port: err.port
            });
            
            // 记录连接池状态
            console.log(`📊 连接池状态:`, {
                totalCount: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount
            });
            
            this.isConnected = false;
            
            // 尝试重连
            setTimeout(() => {
                this.attemptReconnect();
            }, 5000);
        });

        // 监听连接建立
        this.pool.on('connect', (client) => {
            const now = new Date().toISOString();
            console.log(`✅ [${now}] 新数据库连接建立`);
            
            client.on('error', (err) => {
                console.error(`❌ [${now}] 数据库客户端连接错误:`, err.message);
            });
            
            client.on('end', () => {
                console.log(`🔌 [${now}] 数据库连接正常关闭`);
            });
        });

        // 监听连接获取
        this.pool.on('acquire', (client) => {
            console.log(`🔗 连接池获取连接，当前活跃连接: ${this.pool.totalCount - this.pool.idleCount}`);
        });

        // 监听连接释放
        this.pool.on('release', (client) => {
            console.log(`🔓 连接池释放连接，当前空闲连接: ${this.pool.idleCount}`);
        });
    }

    /**
     * 尝试重新连接数据库
     */
    async attemptReconnect() {
        if (this.isConnected) return;

        console.log('🔄 尝试重新连接数据库...');
        
        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            
            this.isConnected = true;
            console.log('✅ 数据库重连成功');
        } catch (error) {
            console.error('❌ 数据库重连失败:', error.message);
            
            // 5秒后再次尝试重连
            setTimeout(() => {
                this.attemptReconnect();
            }, 5000);
        }
    }

    /**
     * 确保数据库连接可用（按需重连）
     * @returns {Promise<boolean>} 是否连接成功
     */
    async ensureConnection() {
        // 如果连接正常，直接返回
        if (this.isConnected && this.pool) {
            try {
                // 快速测试连接是否真的可用
                const client = await this.pool.connect();
                await client.query('SELECT 1');
                client.release();
                return true;
            } catch (error) {
                console.log('🔍 检测到连接异常，准备重连...');
                this.isConnected = false;
            }
        }

        // 连接不可用，尝试重连
        console.log('🔄 数据库连接不可用，开始重连...');
        return await this.attemptReconnect();
    }

    /**
     * 获取环境特定的数据库URL
     * @returns {string} 数据库连接URL
     */
    getEnvironmentSpecificDatabaseUrl() {
        const nodeEnv = process.env.NODE_ENV || 'development';

        // 优先使用环境特定的数据库URL
        const envSpecificUrl = process.env[`DATABASE_URL_${nodeEnv.toUpperCase()}`];
        if (envSpecificUrl) {
            console.log(`📋 使用环境特定数据库URL [${nodeEnv}]`);
            return envSpecificUrl;
        }

        // 回退到通用数据库URL
        const generalUrl = process.env.DATABASE_URL;
        if (generalUrl) {
            console.log(`📋 使用通用数据库URL [${nodeEnv}]`);
            return generalUrl;
        }

        return null;
    }

    /**
     * 获取环境特定的连接池配置
     * @param {string} databaseUrl - 数据库连接URL
     * @returns {Object} 连接池配置
     */
    getEnvironmentSpecificPoolConfig(databaseUrl) {
        const nodeEnv = process.env.NODE_ENV || 'development';

        const baseConfig = {
            connectionString: databaseUrl,
            ssl: nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
        };

        // 环境特定的连接池配置
        switch (nodeEnv) {
            case 'production':
                return {
                    ...baseConfig,
                    max: 20, // 生产环境更多连接
                    min: 5,  // 保持最小连接数
                    idleTimeoutMillis: 60000, // 60秒空闲超时
                    connectionTimeoutMillis: 5000, // 5秒连接超时
                    acquireTimeoutMillis: 10000, // 10秒获取连接超时
                };

            case 'test':
                return {
                    ...baseConfig,
                    max: 5,  // 测试环境较少连接
                    min: 1,
                    idleTimeoutMillis: 10000, // 10秒空闲超时
                    connectionTimeoutMillis: 2000, // 2秒连接超时
                    acquireTimeoutMillis: 5000, // 5秒获取连接超时
                };

            case 'development':
            default:
                return {
                    ...baseConfig,
                    max: 5, // 减少最大连接数
                    min: 1, // 减少最小连接数
                    idleTimeoutMillis: 240000, // 4分钟空闲超时（小于Railway的5分钟限制）
                    connectionTimeoutMillis: 5000, // 增加连接超时
                    acquireTimeoutMillis: 10000, // 增加获取连接超时
                    // Railway优化配置
                    keepAlive: true,
                    keepAliveInitialDelayMillis: 30000, // 30秒后开始保活
                    // 添加更频繁的保活
                    statement_timeout: 0, // 禁用语句超时
                    query_timeout: 0, // 禁用查询超时
                };
        }
    }

    /**
     * 获取环境信息
     * @returns {Object} 环境信息
     */
    getEnvironmentInfo() {
        const nodeEnv = process.env.NODE_ENV || 'development';

        return {
            nodeEnv,
            isProduction: nodeEnv === 'production',
            isDevelopment: nodeEnv === 'development',
            isTest: nodeEnv === 'test',
            databaseUrl: this.getEnvironmentSpecificDatabaseUrl(),
            poolConfig: this.pool ? {
                totalCount: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount
            } : null
        };
    }

    /**
     * 初始化数据库表结构
     */
    async initializeTables() {
        const tables = [
            {
                name: 'refresh_tokens',
                sql: `
                    CREATE TABLE IF NOT EXISTS refresh_tokens (
                        username VARCHAR(100) PRIMARY KEY,
                        refresh_token TEXT NOT NULL,
                        auth_status VARCHAR(20) DEFAULT 'active',
                        auth_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        expires_at TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'monitor_state',
                sql: `
                    CREATE TABLE IF NOT EXISTS monitor_state (
                        monitor_user VARCHAR(50) PRIMARY KEY,
                        last_tweet_id VARCHAR(50),
                        last_check_time TEXT,
                        total_tweets INTEGER DEFAULT 0,
                        success_count INTEGER DEFAULT 0,
                        error_count INTEGER DEFAULT 0,
                        rate_limit_hits INTEGER DEFAULT 0,
                        last_success_time TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `
            },
            {
                name: 'api_usage_stats',
                sql: `
                    CREATE TABLE IF NOT EXISTS api_usage_stats (
                        credential_id VARCHAR(50) PRIMARY KEY,
                        daily_requests INTEGER DEFAULT 0,
                        last_request_time TIMESTAMP,
                        reset_date DATE DEFAULT CURRENT_DATE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `
            }
        ];

        for (const table of tables) {
            try {
                await this.pool.query(table.sql);
                console.log(`✅ 表 ${table.name} 初始化成功`);
            } catch (error) {
                console.error(`❌ 表 ${table.name} 初始化失败:`, error.message);
                throw error;
            }
        }
    }

    /**
     * 执行查询
     * @param {string} text - SQL查询语句
     * @param {Array} params - 查询参数
     * @returns {Promise<Object>} 查询结果
     */
    async query(text, params = []) {
        if (!this.isConnected) {
            throw new Error('数据库未连接');
        }

        try {
            const result = await this.pool.query(text, params);
            return result;
        } catch (error) {
            // 如果是连接错误，标记为未连接并尝试重连
            if (error.message.includes('Connection terminated') || 
                error.message.includes('connection closed') ||
                error.code === 'ECONNRESET') {
                
                console.error('❌ 数据库连接断开，尝试重连...');
                this.isConnected = false;
                
                // 异步尝试重连，不阻塞当前查询
                setTimeout(() => {
                    this.attemptReconnect();
                }, 1000);
            }
            
            console.error('数据库查询失败:', error.message);
            throw error;
        }
    }

    /**
     * 获取refreshToken
     * @param {string} username - 用户名
     * @returns {Promise<string|null>} refreshToken
     */
    async getRefreshToken(username) {
        try {
            const result = await this.query(
                'SELECT refresh_token FROM refresh_tokens WHERE username = $1',
                [username]
            );
            return result.rows.length > 0 ? result.rows[0].refresh_token : null;
        } catch (error) {
            console.error(`获取refreshToken失败 [${username}]:`, error.message);
            return null;
        }
    }

    /**
     * 获取refreshToken及详细信息
     * @param {string} username - 用户名
     * @returns {Promise<Object|null>} refreshToken详细信息
     */
    async getRefreshTokenWithDetails(username) {
        try {
            const result = await this.query(
                'SELECT username, refresh_token, auth_status, auth_time, expires_at, updated_at FROM refresh_tokens WHERE username = $1',
                [username]
            );
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error(`获取refreshToken详细信息失败 [${username}]:`, error.message);
            return null;
        }
    }

    /**
     * 保存refreshToken
     * @param {string} username - 用户名
     * @param {string} refreshToken - 刷新令牌
     * @returns {Promise<boolean>} 是否保存成功
     */
    async saveRefreshToken(username, refreshToken) {
        try {
            await this.query(
                `INSERT INTO refresh_tokens (username, refresh_token) 
                 VALUES ($1, $2) 
                 ON CONFLICT (username) 
                 DO UPDATE SET refresh_token = $2, updated_at = CURRENT_TIMESTAMP`,
                [username, refreshToken]
            );
            return true;
        } catch (error) {
            console.error(`保存refreshToken失败 [${username}]:`, error.message);
            return false;
        }
    }

    /**
     * 获取监控状态
     * @param {string} monitorUser - 监控用户
     * @returns {Promise<Object|null>} 监控状态
     */
    async getMonitorState(monitorUser) {
        try {
            const result = await this.query(
                'SELECT * FROM monitor_state WHERE monitor_user = $1',
                [monitorUser]
            );
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error(`获取监控状态失败 [${monitorUser}]:`, error.message);
            return null;
        }
    }

    /**
     * 保存监控状态
     * @param {string} monitorUser - 监控用户
     * @param {string} lastTweetId - 最后推文ID
     * @returns {Promise<boolean>} 是否保存成功
     */
    async saveMonitorState(monitorUser, lastTweetId) {
        try {
            const currentTime = new Date().toISOString();
            await this.query(
                `INSERT INTO monitor_state (monitor_user, last_tweet_id, last_check_time, updated_at) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (monitor_user) 
                 DO UPDATE SET last_tweet_id = $2, last_check_time = $3, updated_at = $4`,
                [monitorUser, lastTweetId, currentTime, currentTime]
            );
            return true;
        } catch (error) {
            console.error(`保存监控状态失败 [${monitorUser}]:`, error.message);
            return false;
        }
    }

    /**
     * 更新监控状态
     * @param {string} monitorUser - 监控用户
     * @param {string} lastTweetId - 最后推文ID（可选）
     * @param {string} checkTime - 检查时间（可选）
     * @returns {Promise<boolean>} 是否更新成功
     */
    async updateMonitorState(monitorUser, lastTweetId = null, checkTime = null) {
        try {
            let query = `INSERT INTO monitor_state (monitor_user`;
            let values = [monitorUser];
            let placeholders = ['$1'];
            let updateFields = [];
            let paramIndex = 2;

            if (lastTweetId !== null) {
                query += `, last_tweet_id`;
                placeholders.push(`$${paramIndex}`);
                values.push(lastTweetId);
                updateFields.push(`last_tweet_id = EXCLUDED.last_tweet_id`);
                paramIndex++;
            }

            if (checkTime !== null) {
                query += `, last_check_time`;
                placeholders.push(`$${paramIndex}`);
                values.push(checkTime);
                updateFields.push(`last_check_time = EXCLUDED.last_check_time`);
                paramIndex++;
            } else {
                query += `, last_check_time`;
                placeholders.push(`$${paramIndex}`);
                values.push(new Date().toISOString());
                updateFields.push(`last_check_time = EXCLUDED.last_check_time`);
                paramIndex++;
            }

            query += `) VALUES (${placeholders.join(', ')})`;
            query += ` ON CONFLICT (monitor_user) DO UPDATE SET ${updateFields.join(', ')}`;

            await this.query(query, values);
            return true;
        } catch (error) {
            console.error(`更新监控状态失败 [${monitorUser}]:`, error.message);
            console.error('SQL:', query);
            console.error('参数:', values);
            return false;
        }
    }

    /**
     * 更新监控统计
     * @param {string} monitorUser - 监控用户
     * @param {Object} stats - 统计数据
     * @returns {Promise<boolean>} 是否更新成功
     */
    async updateMonitorStats(monitorUser, stats) {
        try {
            const {
                totalTweets = 0,
                successCount = 0,
                errorCount = 0,
                rateLimitHits = 0,
                lastSuccessTime = null
            } = stats;

            const currentTime = new Date().toISOString();
            await this.query(
                `INSERT INTO monitor_state 
                 (monitor_user, total_tweets, success_count, error_count, rate_limit_hits, last_success_time, updated_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7) 
                 ON CONFLICT (monitor_user) 
                 DO UPDATE SET 
                    total_tweets = monitor_state.total_tweets + $2,
                    success_count = monitor_state.success_count + $3,
                    error_count = monitor_state.error_count + $4,
                    rate_limit_hits = monitor_state.rate_limit_hits + $5,
                    last_success_time = COALESCE($6, monitor_state.last_success_time),
                    updated_at = $7`,
                [monitorUser, totalTweets, successCount, errorCount, rateLimitHits, lastSuccessTime, currentTime]
            );
            return true;
        } catch (error) {
            console.error(`更新监控统计失败 [${monitorUser}]:`, error.message);
            return false;
        }
    }

    /**
     * 获取监控统计
     * @param {string} monitorUser - 监控用户
     * @returns {Promise<Object|null>} 统计数据
     */
    async getMonitorStats(monitorUser) {
        try {
            const result = await this.query(
                'SELECT * FROM monitor_state WHERE monitor_user = $1',
                [monitorUser]
            );
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error(`获取监控统计失败 [${monitorUser}]:`, error.message);
            return null;
        }
    }

    /**
     * 更新API使用统计
     * @param {string} credentialId - 凭证ID
     * @returns {Promise<boolean>} 是否更新成功
     */
    async updateApiUsage(credentialId) {
        try {
            await this.query(
                `INSERT INTO api_usage_stats (credential_id, daily_requests, last_request_time, reset_date) 
                 VALUES ($1, 1, CURRENT_TIMESTAMP, CURRENT_DATE) 
                 ON CONFLICT (credential_id) 
                 DO UPDATE SET 
                    daily_requests = CASE 
                        WHEN api_usage_stats.reset_date < CURRENT_DATE 
                        THEN 1 
                        ELSE api_usage_stats.daily_requests + 1 
                    END,
                    last_request_time = CURRENT_TIMESTAMP,
                    reset_date = CURRENT_DATE`,
                [credentialId]
            );
            return true;
        } catch (error) {
            console.error(`更新API使用统计失败 [${credentialId}]:`, error.message);
            return false;
        }
    }

    /**
     * 关闭数据库连接
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            console.log('数据库连接已关闭');
        }
    }

    /**
     * 检查连接状态
     * @returns {boolean} 是否已连接
     */
    isHealthy() {
        return this.isConnected;
    }

    /**
     * 批量获取所有refreshToken
     * @returns {Promise<Map<string, string>>} 用户名到refreshToken的映射
     */
    async getAllRefreshTokens() {
        try {
            const result = await this.query('SELECT username, refresh_token FROM refresh_tokens');
            const tokenMap = new Map();
            result.rows.forEach(row => {
                tokenMap.set(row.username, row.refresh_token);
            });
            return tokenMap;
        } catch (error) {
            console.error('批量获取refreshToken失败:', error.message);
            return new Map();
        }
    }

    /**
     * 批量保存refreshToken
     * @param {Map<string, string>} tokenMap - 用户名到refreshToken的映射
     * @returns {Promise<boolean>} 是否保存成功
     */
    async batchSaveRefreshTokens(tokenMap) {
        if (tokenMap.size === 0) return true;

        try {
            const client = await this.pool.connect();

            try {
                await client.query('BEGIN');

                for (const [username, refreshToken] of tokenMap.entries()) {
                    await client.query(
                        `INSERT INTO refresh_tokens (username, refresh_token) 
                         VALUES ($1, $2) 
                         ON CONFLICT (username) 
                         DO UPDATE SET refresh_token = $2, updated_at = CURRENT_TIMESTAMP`,
                        [username, refreshToken]
                    );
                }

                await client.query('COMMIT');
                console.log(`✅ 批量保存 ${tokenMap.size} 个refreshToken成功`);
                return true;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('批量保存refreshToken失败:', error.message);
            return false;
        }
    }

    /**
     * 获取所有监控状态
     * @returns {Promise<Map<string, Object>>} 用户到监控状态的映射
     */
    async getAllMonitorStates() {
        try {
            const result = await this.query('SELECT * FROM monitor_state');
            const stateMap = new Map();
            result.rows.forEach(row => {
                stateMap.set(row.monitor_user, {
                    lastTweetId: row.last_tweet_id,
                    lastCheckTime: row.last_check_time
                });
            });
            return stateMap;
        } catch (error) {
            console.error('获取所有监控状态失败:', error.message);
            return new Map();
        }
    }

    /**
     * 批量保存监控状态
     * @param {Map<string, string>} stateMap - 用户到最后推文ID的映射
     * @returns {Promise<boolean>} 是否保存成功
     */
    async batchSaveMonitorStates(stateMap) {
        if (stateMap.size === 0) return true;

        try {
            const client = await this.pool.connect();

            try {
                await client.query('BEGIN');

                for (const [monitorUser, lastTweetId] of stateMap.entries()) {
                    await client.query(
                        `INSERT INTO monitor_state (monitor_user, last_tweet_id, last_check_time) 
                         VALUES ($1, $2, CURRENT_TIMESTAMP) 
                         ON CONFLICT (monitor_user) 
                         DO UPDATE SET last_tweet_id = $2, last_check_time = CURRENT_TIMESTAMP`,
                        [monitorUser, lastTweetId]
                    );
                }

                await client.query('COMMIT');
                console.log(`✅ 批量保存 ${stateMap.size} 个监控状态成功`);
                return true;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('批量保存监控状态失败:', error.message);
            return false;
        }
    }

    /**
     * 获取所有监控统计
     * @returns {Promise<Map<string, Object>>} 用户到统计数据的映射
     */
    async getAllMonitorStats() {
        try {
            const result = await this.query('SELECT * FROM monitor_state');
            const statsMap = new Map();
            result.rows.forEach(row => {
                statsMap.set(row.monitor_user, {
                    totalTweets: row.total_tweets,
                    successCount: row.success_count,
                    errorCount: row.error_count,
                    rateLimitHits: row.rate_limit_hits,
                    lastSuccessTime: row.last_success_time,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                });
            });
            return statsMap;
        } catch (error) {
            console.error('获取所有监控统计失败:', error.message);
            return new Map();
        }
    }

    /**
     * 重置监控统计
     * @param {string} monitorUser - 监控用户
     * @returns {Promise<boolean>} 是否重置成功
     */
    async resetMonitorStats(monitorUser) {
        try {
            await this.query(
                `UPDATE monitor_state 
                 SET total_tweets = 0, success_count = 0, error_count = 0, 
                     rate_limit_hits = 0, last_success_time = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE monitor_user = $1`,
                [monitorUser]
            );
            return true;
        } catch (error) {
            console.error(`重置监控统计失败 [${monitorUser}]:`, error.message);
            return false;
        }
    }

    /**
     * 删除监控数据
     * @param {string} monitorUser - 监控用户
     * @returns {Promise<boolean>} 是否删除成功
     */
    async deleteMonitorData(monitorUser) {
        try {
            const client = await this.pool.connect();

            try {
                await client.query('BEGIN');

                // 删除监控状态
                await client.query('DELETE FROM monitor_state WHERE monitor_user = $1', [monitorUser]);

                // 删除监控统计
                await client.query('DELETE FROM monitor_state WHERE monitor_user = $1', [monitorUser]);

                await client.query('COMMIT');
                console.log(`✅ 删除监控数据成功 [用户: ${monitorUser}]`);
                return true;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error(`删除监控数据失败 [${monitorUser}]:`, error.message);
            return false;
        }
    }

    /**
     * 获取API使用统计
     * @param {string} credentialId - 凭证ID
     * @returns {Promise<Object|null>} API使用统计
     */
    async getApiUsageStats(credentialId) {
        try {
            const result = await this.query(
                'SELECT * FROM api_usage_stats WHERE credential_id = $1',
                [credentialId]
            );
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error(`获取API使用统计失败 [${credentialId}]:`, error.message);
            return null;
        }
    }

    /**
     * 获取所有API使用统计
     * @returns {Promise<Map<string, Object>>} 凭证ID到使用统计的映射
     */
    async getAllApiUsageStats() {
        try {
            const result = await this.query('SELECT * FROM api_usage_stats');
            const statsMap = new Map();
            result.rows.forEach(row => {
                statsMap.set(row.credential_id, {
                    dailyRequests: row.daily_requests,
                    lastRequestTime: row.last_request_time,
                    resetDate: row.reset_date,
                    createdAt: row.created_at
                });
            });
            return statsMap;
        } catch (error) {
            console.error('获取所有API使用统计失败:', error.message);
            return new Map();
        }
    }

    /**
     * 清理过期的API使用统计
     * @param {number} daysToKeep - 保留天数，默认30天
     * @returns {Promise<boolean>} 是否清理成功
     */
    async cleanupApiUsageStats(daysToKeep = 30) {
        try {
            const result = await this.query(
                `DELETE FROM api_usage_stats 
                 WHERE reset_date < CURRENT_DATE - INTERVAL '${daysToKeep} days'`
            );
            console.log(`✅ 清理了 ${result.rowCount} 条过期的API使用统计`);
            return true;
        } catch (error) {
            console.error('清理API使用统计失败:', error.message);
            return false;
        }
    }

    /**
     * 获取数据库统计信息
     * @returns {Promise<Object>} 数据库统计信息
     */
    async getDatabaseStats() {
        try {
            const stats = {
                refreshTokens: 0,
                monitorState: 0,
                apiUsageStats: 0,
                totalSize: 0
            };

            // 获取各表的记录数
            const tables = ['refresh_tokens', 'monitor_state', 'api_usage_stats'];

            for (const table of tables) {
                const result = await this.query(`SELECT COUNT(*) as count FROM ${table}`);
                const fieldName = table.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
                stats[fieldName] = parseInt(result.rows[0].count);
            }

            // 获取数据库大小（如果支持）
            try {
                const sizeResult = await this.query(
                    `SELECT pg_size_pretty(pg_database_size(current_database())) as size`
                );
                stats.databaseSize = sizeResult.rows[0].size;
            } catch (error) {
                stats.databaseSize = '未知';
            }

            return stats;
        } catch (error) {
            console.error('获取数据库统计失败:', error.message);
            return null;
        }
    }

    /**
     * 执行数据库健康检查
     * @returns {Promise<Object>} 健康检查结果
     */
    async performHealthCheck() {
        const healthCheck = {
            isConnected: this.isConnected,
            connectionTest: false,
            tablesExist: false,
            canWrite: false,
            canRead: false,
            timestamp: new Date().toISOString()
        };

        try {
            // 测试连接
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            healthCheck.connectionTest = true;

            // 检查表是否存在
            const tablesResult = await this.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('refresh_tokens', 'monitor_state', 'api_usage_stats')
            `);
            healthCheck.tablesExist = tablesResult.rows.length === 3;

            // 测试写入
            const testId = `health_check_${Date.now()}`;
            await this.query(
                'INSERT INTO refresh_tokens (username, refresh_token) VALUES ($1, $2)',
                [testId, 'test_token']
            );
            healthCheck.canWrite = true;

            // 测试读取
            const readResult = await this.query(
                'SELECT * FROM refresh_tokens WHERE username = $1',
                [testId]
            );
            healthCheck.canRead = readResult.rows.length > 0;

            // 清理测试数据
            await this.query('DELETE FROM refresh_tokens WHERE username = $1', [testId]);

        } catch (error) {
            console.error('数据库健康检查失败:', error.message);
            healthCheck.error = error.message;
        }

        return healthCheck;
    }
}

// 创建数据库管理器实例
export const databaseManager = new DatabaseManager();