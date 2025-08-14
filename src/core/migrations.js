/**
 * 数据库迁移管理器
 * 管理数据库架构版本和迁移脚本
 */
import { unifiedDatabaseManager } from './database.js';

export class DatabaseMigrationManager {
    constructor() {
        this.migrations = new Map();
        this.currentVersion = null;
        this.targetVersion = null;
        
        // 初始化迁移脚本
        this.initializeMigrations();
    }

    /**
     * 初始化迁移脚本
     */
    initializeMigrations() {
        // 版本 1.0.0 - 基础Twitter监控表
        this.migrations.set('1.0.0', {
            version: '1.0.0',
            description: '初始化Twitter监控基础表结构',
            up: async (client) => {
                await client.query(`
                    CREATE TABLE IF NOT EXISTS refresh_tokens (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(255) UNIQUE NOT NULL,
                        refresh_token TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await client.query(`
                    CREATE TABLE IF NOT EXISTS monitor_state (
                        id SERIAL PRIMARY KEY,
                        monitor_user VARCHAR(255) NOT NULL,
                        last_tweet_id VARCHAR(50),
                        last_check_time TIMESTAMP,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await client.query(`
                    CREATE TABLE IF NOT EXISTS tweets (
                        id SERIAL PRIMARY KEY,
                        tweet_id VARCHAR(50) UNIQUE NOT NULL,
                        user_id VARCHAR(50) NOT NULL,
                        username VARCHAR(255) NOT NULL,
                        content TEXT NOT NULL,
                        created_at TIMESTAMP NOT NULL,
                        monitor_user VARCHAR(255) NOT NULL,
                        saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
            },
            down: async (client) => {
                await client.query('DROP TABLE IF EXISTS tweets');
                await client.query('DROP TABLE IF EXISTS monitor_state');
                await client.query('DROP TABLE IF EXISTS refresh_tokens');
            }
        });

        // 版本 1.1.0 - 多监控源支持
        this.migrations.set('1.1.0', {
            version: '1.1.0',
            description: '添加多监控源支持',
            up: async (client) => {
                // 添加模块名称列到现有表
                await client.query(`
                    ALTER TABLE monitor_state 
                    ADD COLUMN IF NOT EXISTS module_name VARCHAR(50) DEFAULT 'twitter'
                `);

                // 创建监控模块注册表
                await client.query(`
                    CREATE TABLE IF NOT EXISTS monitor_modules (
                        module_name VARCHAR(50) PRIMARY KEY,
                        module_type VARCHAR(20) NOT NULL,
                        enabled BOOLEAN DEFAULT true,
                        config JSONB,
                        status VARCHAR(20) DEFAULT 'stopped',
                        last_start_time TIMESTAMP,
                        last_stop_time TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 注册Twitter模块
                await client.query(`
                    INSERT INTO monitor_modules (module_name, module_type, enabled, created_at, updated_at)
                    VALUES ('twitter', 'social_media', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (module_name) DO NOTHING
                `);
            },
            down: async (client) => {
                await client.query('ALTER TABLE monitor_state DROP COLUMN IF EXISTS module_name');
                await client.query('DROP TABLE IF EXISTS monitor_modules');
            }
        });

        // 版本 1.2.0 - 币安监控支持
        this.migrations.set('1.2.0', {
            version: '1.2.0',
            description: '添加币安监控支持',
            up: async (client) => {
                // 创建币安公告表
                await client.query(`
                    CREATE TABLE IF NOT EXISTS binance_announcements (
                        id SERIAL PRIMARY KEY,
                        announcement_id VARCHAR(255) NOT NULL,
                        title TEXT NOT NULL,
                        content TEXT,
                        publish_time TIMESTAMP NOT NULL,
                        language VARCHAR(10) NOT NULL DEFAULT 'zh-CN',
                        catalog_id INTEGER,
                        catalog_name VARCHAR(255),
                        type VARCHAR(50) DEFAULT 'announcement',
                        priority INTEGER DEFAULT 1,
                        tags JSONB,
                        url TEXT,
                        raw_data JSONB,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(announcement_id, language)
                    )
                `);

                // 添加币安相关字段到monitor_state表
                await client.query(`
                    ALTER TABLE monitor_state 
                    ADD COLUMN IF NOT EXISTS last_announcement_id VARCHAR(100),
                    ADD COLUMN IF NOT EXISTS websocket_status VARCHAR(20),
                    ADD COLUMN IF NOT EXISTS api_status VARCHAR(20)
                `);

                // 创建索引
                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_binance_announcements_id 
                    ON binance_announcements(announcement_id)
                `);
                
                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_binance_announcements_time 
                    ON binance_announcements(publish_time)
                `);

                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_binance_announcements_type 
                    ON binance_announcements(type, priority)
                `);
                
                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_binance_announcements_language 
                    ON binance_announcements(language)
                `);
            },
            down: async (client) => {
                await client.query('DROP INDEX IF EXISTS idx_binance_announcements_category');
                await client.query('DROP INDEX IF EXISTS idx_binance_announcements_time');
                await client.query('DROP INDEX IF EXISTS idx_binance_announcements_id');
                await client.query(`
                    ALTER TABLE monitor_state 
                    DROP COLUMN IF EXISTS api_status,
                    DROP COLUMN IF EXISTS websocket_status,
                    DROP COLUMN IF EXISTS last_announcement_id
                `);
                await client.query('DROP TABLE IF EXISTS binance_announcements');
            }
        });

        // 版本 1.3.0 - 通知和指标系统
        this.migrations.set('1.3.0', {
            version: '1.3.0',
            description: '添加通知历史和系统指标支持',
            up: async (client) => {
                // 创建通知历史表
                await client.query(`
                    CREATE TABLE IF NOT EXISTS notification_history (
                        id SERIAL PRIMARY KEY,
                        module_name VARCHAR(50) NOT NULL,
                        notification_type VARCHAR(50) NOT NULL,
                        content TEXT NOT NULL,
                        recipient VARCHAR(100),
                        status VARCHAR(20) DEFAULT 'pending',
                        sent_at TIMESTAMP,
                        error_message TEXT,
                        retry_count INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 创建系统性能指标表
                await client.query(`
                    CREATE TABLE IF NOT EXISTS system_metrics (
                        id SERIAL PRIMARY KEY,
                        module_name VARCHAR(50),
                        metric_name VARCHAR(50) NOT NULL,
                        metric_value DECIMAL(10,2),
                        metric_unit VARCHAR(20),
                        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 创建索引
                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_notification_history_module 
                    ON notification_history(module_name, created_at)
                `);

                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_notification_history_status 
                    ON notification_history(status, created_at)
                `);

                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_system_metrics_module 
                    ON system_metrics(module_name, recorded_at)
                `);

                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_system_metrics_name 
                    ON system_metrics(metric_name, recorded_at)
                `);
            },
            down: async (client) => {
                await client.query('DROP INDEX IF EXISTS idx_system_metrics_name');
                await client.query('DROP INDEX IF EXISTS idx_system_metrics_module');
                await client.query('DROP INDEX IF EXISTS idx_notification_history_status');
                await client.query('DROP INDEX IF EXISTS idx_notification_history_module');
                await client.query('DROP TABLE IF EXISTS system_metrics');
                await client.query('DROP TABLE IF EXISTS notification_history');
            }
        });

        // 版本 1.4.0 - 数据清理和优化
        this.migrations.set('1.4.0', {
            version: '1.4.0',
            description: '添加数据清理和性能优化',
            up: async (client) => {
                // 添加数据保留策略字段
                await client.query(`
                    ALTER TABLE binance_announcements 
                    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
                `);

                await client.query(`
                    ALTER TABLE notification_history 
                    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
                `);

                await client.query(`
                    ALTER TABLE system_metrics 
                    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
                `);

                // 创建数据清理配置表
                await client.query(`
                    CREATE TABLE IF NOT EXISTS data_retention_policies (
                        id SERIAL PRIMARY KEY,
                        table_name VARCHAR(50) NOT NULL,
                        retention_days INTEGER NOT NULL,
                        enabled BOOLEAN DEFAULT true,
                        last_cleanup TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 插入默认数据保留策略
                await client.query(`
                    INSERT INTO data_retention_policies (table_name, retention_days, enabled)
                    VALUES 
                        ('binance_announcements', 30, true),
                        ('notification_history', 7, true),
                        ('system_metrics', 30, true),
                        ('tweets', 30, true)
                    ON CONFLICT DO NOTHING
                `);

                // 创建分区表（如果支持）
                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_binance_announcements_expires 
                    ON binance_announcements(expires_at) WHERE expires_at IS NOT NULL
                `);

                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_notification_history_expires 
                    ON notification_history(expires_at) WHERE expires_at IS NOT NULL
                `);
            },
            down: async (client) => {
                await client.query('DROP INDEX IF EXISTS idx_notification_history_expires');
                await client.query('DROP INDEX IF EXISTS idx_binance_announcements_expires');
                await client.query('DROP TABLE IF EXISTS data_retention_policies');
                await client.query(`
                    ALTER TABLE system_metrics 
                    DROP COLUMN IF EXISTS expires_at
                `);
                await client.query(`
                    ALTER TABLE notification_history 
                    DROP COLUMN IF EXISTS expires_at
                `);
                await client.query(`
                    ALTER TABLE binance_announcements 
                    DROP COLUMN IF EXISTS expires_at
                `);
            }
        });

        // 版本 1.5.0 - 价格预警功能
        this.migrations.set('1.5.0', {
            version: '1.5.0',
            description: '添加Binance价格预警功能',
            up: async (client) => {
                // 创建价格预警表
                await client.query(`
                    CREATE TABLE IF NOT EXISTS price_alerts (
                        id SERIAL PRIMARY KEY,
                        symbol VARCHAR(20) NOT NULL,
                        base_price DECIMAL(20,8) NOT NULL,
                        current_price DECIMAL(20,8),
                        alert_threshold DECIMAL(5,2) DEFAULT 10.00,
                        last_alert_time TIMESTAMP,
                        alert_count INTEGER DEFAULT 0,
                        is_active BOOLEAN DEFAULT true,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(symbol)
                    )
                `);

                // 创建价格历史表（用于趋势分析）
                await client.query(`
                    CREATE TABLE IF NOT EXISTS price_history (
                        id SERIAL PRIMARY KEY,
                        symbol VARCHAR(20) NOT NULL,
                        price DECIMAL(20,8) NOT NULL,
                        change_24h DECIMAL(10,4),
                        change_percent_24h DECIMAL(8,4),
                        volume_24h DECIMAL(20,8),
                        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 创建预警历史表
                await client.query(`
                    CREATE TABLE IF NOT EXISTS alert_history (
                        id SERIAL PRIMARY KEY,
                        symbol VARCHAR(20) NOT NULL,
                        alert_type VARCHAR(50) NOT NULL,
                        trigger_price DECIMAL(20,8) NOT NULL,
                        base_price DECIMAL(20,8) NOT NULL,
                        change_percent DECIMAL(8,4) NOT NULL,
                        message TEXT,
                        notification_sent BOOLEAN DEFAULT false,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 创建索引
                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol 
                    ON price_alerts(symbol, is_active)
                `);

                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_price_history_symbol_time 
                    ON price_history(symbol, recorded_at)
                `);

                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_alert_history_symbol_time 
                    ON alert_history(symbol, created_at)
                `);

                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_alert_history_type 
                    ON alert_history(alert_type, created_at)
                `);

                // 注册价格预警模块
                await client.query(`
                    INSERT INTO monitor_modules (module_name, module_type, enabled, created_at, updated_at)
                    VALUES ('binance-price-alert', 'price_monitor', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (module_name) DO NOTHING
                `);

                // 添加默认数据保留策略
                await client.query(`
                    INSERT INTO data_retention_policies (table_name, retention_days, enabled)
                    VALUES 
                        ('price_history', 90, true),
                        ('alert_history', 30, true)
                    ON CONFLICT DO NOTHING
                `);
            },
            down: async (client) => {
                await client.query('DROP INDEX IF EXISTS idx_alert_history_type');
                await client.query('DROP INDEX IF EXISTS idx_alert_history_symbol_time');
                await client.query('DROP INDEX IF EXISTS idx_price_history_symbol_time');
                await client.query('DROP INDEX IF EXISTS idx_price_alerts_symbol');
                await client.query('DROP TABLE IF EXISTS alert_history');
                await client.query('DROP TABLE IF EXISTS price_history');
                await client.query('DROP TABLE IF EXISTS price_alerts');
                await client.query(`
                    DELETE FROM monitor_modules WHERE module_name = 'binance-price-alert'
                `);
                await client.query(`
                    DELETE FROM data_retention_policies 
                    WHERE table_name IN ('price_history', 'alert_history')
                `);
            }
        });

        // 设置目标版本为最新版本
        this.targetVersion = '1.5.0';
    }

    /**
     * 创建迁移版本表
     */
    async createMigrationTable() {
        const client = await unifiedDatabaseManager.pool.connect();
        
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(20) PRIMARY KEY,
                    description TEXT,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    rollback_sql TEXT
                )
            `);
            
            console.log('✅ 迁移版本表创建成功');
        } catch (error) {
            console.error('❌ 创建迁移版本表失败:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * 获取当前数据库版本
     * @returns {Promise<string|null>} 当前版本
     */
    async getCurrentVersion() {
        if (!await unifiedDatabaseManager.ensureConnection()) {
            return null;
        }

        try {
            // 确保迁移表存在
            await this.createMigrationTable();

            const result = await unifiedDatabaseManager.pool.query(
                'SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
            );

            this.currentVersion = result.rows.length > 0 ? result.rows[0].version : null;
            return this.currentVersion;
        } catch (error) {
            console.error('❌ 获取当前版本失败:', error.message);
            return null;
        }
    }

    /**
     * 执行数据库迁移
     * @param {string} targetVersion - 目标版本（可选）
     * @returns {Promise<boolean>} 是否迁移成功
     */
    async migrate(targetVersion = null) {
        try {
            console.log('🚀 开始数据库迁移...');

            if (!await unifiedDatabaseManager.ensureConnection()) {
                throw new Error('数据库连接失败');
            }

            // 获取当前版本
            const currentVersion = await this.getCurrentVersion();
            const target = targetVersion || this.targetVersion;

            console.log(`当前版本: ${currentVersion || '无'}`);
            console.log(`目标版本: ${target}`);

            // 获取需要执行的迁移
            const migrationsToRun = this.getMigrationsToRun(currentVersion, target);

            if (migrationsToRun.length === 0) {
                console.log('✅ 数据库已是最新版本，无需迁移');
                return true;
            }

            console.log(`需要执行 ${migrationsToRun.length} 个迁移:`);
            migrationsToRun.forEach(m => console.log(`  - ${m.version}: ${m.description}`));

            // 执行迁移
            for (const migration of migrationsToRun) {
                await this.runMigration(migration);
            }

            console.log('✅ 数据库迁移完成');
            return true;

        } catch (error) {
            console.error('❌ 数据库迁移失败:', error.message);
            return false;
        }
    }

    /**
     * 获取需要执行的迁移列表
     * @param {string|null} currentVersion - 当前版本
     * @param {string} targetVersion - 目标版本
     * @returns {Array} 迁移列表
     */
    getMigrationsToRun(currentVersion, targetVersion) {
        const allVersions = Array.from(this.migrations.keys()).sort(this.compareVersions);
        const currentIndex = currentVersion ? allVersions.indexOf(currentVersion) : -1;
        const targetIndex = allVersions.indexOf(targetVersion);

        if (targetIndex === -1) {
            throw new Error(`未知的目标版本: ${targetVersion}`);
        }

        if (currentIndex >= targetIndex) {
            return [];
        }

        return allVersions
            .slice(currentIndex + 1, targetIndex + 1)
            .map(version => this.migrations.get(version));
    }

    /**
     * 执行单个迁移
     * @param {Object} migration - 迁移对象
     */
    async runMigration(migration) {
        const client = await unifiedDatabaseManager.pool.connect();
        
        try {
            console.log(`🔄 执行迁移 ${migration.version}: ${migration.description}`);
            
            await client.query('BEGIN');

            // 执行迁移脚本
            await migration.up(client);

            // 记录迁移版本
            await client.query(
                'INSERT INTO schema_migrations (version, description) VALUES ($1, $2)',
                [migration.version, migration.description]
            );

            await client.query('COMMIT');
            console.log(`✅ 迁移 ${migration.version} 完成`);

        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ 迁移 ${migration.version} 失败:`, error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * 回滚到指定版本
     * @param {string} targetVersion - 目标版本
     * @returns {Promise<boolean>} 是否回滚成功
     */
    async rollback(targetVersion) {
        try {
            console.log(`🔄 开始回滚到版本 ${targetVersion}...`);

            if (!await unifiedDatabaseManager.ensureConnection()) {
                throw new Error('数据库连接失败');
            }

            const currentVersion = await this.getCurrentVersion();
            if (!currentVersion) {
                console.log('当前没有已应用的迁移');
                return true;
            }

            // 获取需要回滚的迁移
            const migrationsToRollback = this.getMigrationsToRollback(currentVersion, targetVersion);

            if (migrationsToRollback.length === 0) {
                console.log('✅ 已经是目标版本，无需回滚');
                return true;
            }

            console.log(`需要回滚 ${migrationsToRollback.length} 个迁移:`);
            migrationsToRollback.forEach(m => console.log(`  - ${m.version}: ${m.description}`));

            // 执行回滚
            for (const migration of migrationsToRollback) {
                await this.runRollback(migration);
            }

            console.log('✅ 数据库回滚完成');
            return true;

        } catch (error) {
            console.error('❌ 数据库回滚失败:', error.message);
            return false;
        }
    }

    /**
     * 获取需要回滚的迁移列表
     * @param {string} currentVersion - 当前版本
     * @param {string} targetVersion - 目标版本
     * @returns {Array} 回滚迁移列表
     */
    getMigrationsToRollback(currentVersion, targetVersion) {
        const allVersions = Array.from(this.migrations.keys()).sort(this.compareVersions);
        const currentIndex = allVersions.indexOf(currentVersion);
        const targetIndex = targetVersion ? allVersions.indexOf(targetVersion) : -1;

        if (currentIndex === -1) {
            throw new Error(`未知的当前版本: ${currentVersion}`);
        }

        if (targetIndex >= currentIndex) {
            return [];
        }

        return allVersions
            .slice(targetIndex + 1, currentIndex + 1)
            .reverse()
            .map(version => this.migrations.get(version));
    }

    /**
     * 执行单个回滚
     * @param {Object} migration - 迁移对象
     */
    async runRollback(migration) {
        const client = await unifiedDatabaseManager.pool.connect();
        
        try {
            console.log(`🔄 回滚迁移 ${migration.version}: ${migration.description}`);
            
            await client.query('BEGIN');

            // 执行回滚脚本
            await migration.down(client);

            // 删除迁移记录
            await client.query(
                'DELETE FROM schema_migrations WHERE version = $1',
                [migration.version]
            );

            await client.query('COMMIT');
            console.log(`✅ 回滚 ${migration.version} 完成`);

        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ 回滚 ${migration.version} 失败:`, error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * 比较版本号
     * @param {string} a - 版本A
     * @param {string} b - 版本B
     * @returns {number} 比较结果
     */
    compareVersions(a, b) {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aPart = aParts[i] || 0;
            const bPart = bParts[i] || 0;
            
            if (aPart < bPart) return -1;
            if (aPart > bPart) return 1;
        }
        
        return 0;
    }

    /**
     * 获取迁移状态
     * @returns {Promise<Object>} 迁移状态信息
     */
    async getMigrationStatus() {
        try {
            const currentVersion = await this.getCurrentVersion();
            const allVersions = Array.from(this.migrations.keys()).sort(this.compareVersions);
            
            const appliedMigrations = [];
            if (currentVersion) {
                const currentIndex = allVersions.indexOf(currentVersion);
                appliedMigrations.push(...allVersions.slice(0, currentIndex + 1));
            }

            const pendingMigrations = allVersions.filter(v => !appliedMigrations.includes(v));

            return {
                currentVersion: currentVersion,
                targetVersion: this.targetVersion,
                totalMigrations: allVersions.length,
                appliedMigrations: appliedMigrations,
                pendingMigrations: pendingMigrations,
                isUpToDate: currentVersion === this.targetVersion
            };

        } catch (error) {
            console.error('❌ 获取迁移状态失败:', error.message);
            return null;
        }
    }

    /**
     * 验证数据库架构
     * @returns {Promise<boolean>} 是否验证通过
     */
    async validateSchema() {
        try {
            console.log('🔍 验证数据库架构...');

            if (!await unifiedDatabaseManager.ensureConnection()) {
                throw new Error('数据库连接失败');
            }

            const client = await unifiedDatabaseManager.pool.connect();
            
            try {
                // 检查必需的表是否存在
                const requiredTables = [
                    'schema_migrations',
                    'monitor_modules',
                    'monitor_state',
                    'binance_announcements',
                    'notification_history',
                    'system_metrics',
                    'refresh_tokens',
                    'tweets'
                ];

                for (const tableName of requiredTables) {
                    const result = await client.query(`
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_name = $1
                        )
                    `, [tableName]);

                    if (!result.rows[0].exists) {
                        throw new Error(`缺少必需的表: ${tableName}`);
                    }
                }

                // 检查关键索引是否存在
                const requiredIndexes = [
                    'idx_binance_announcements_id',
                    'idx_binance_announcements_time',
                    'idx_notification_history_module',
                    'idx_system_metrics_module'
                ];

                for (const indexName of requiredIndexes) {
                    const result = await client.query(`
                        SELECT EXISTS (
                            SELECT FROM pg_indexes 
                            WHERE indexname = $1
                        )
                    `, [indexName]);

                    if (!result.rows[0].exists) {
                        console.warn(`缺少推荐的索引: ${indexName}`);
                    }
                }

                console.log('✅ 数据库架构验证通过');
                return true;

            } finally {
                client.release();
            }

        } catch (error) {
            console.error('❌ 数据库架构验证失败:', error.message);
            return false;
        }
    }
}

// 创建迁移管理器实例
export const migrationManager = new DatabaseMigrationManager();