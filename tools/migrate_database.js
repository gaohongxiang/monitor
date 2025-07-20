#!/usr/bin/env node

/**
 * 数据库迁移工具
 * 将 monitor_state 和 monitor_stats 两个表整合为一个 monitor_state 表
 */

import dotenv from 'dotenv';
import { databaseManager } from '../src/database.js';
import { configManager } from '../src/config.js';

// 加载环境变量
dotenv.config();

class DatabaseMigrator {
    constructor() {
        this.migrationName = 'merge_monitor_tables';
        this.migrationVersion = '2024-01-01';
    }

    /**
     * 执行数据库迁移
     */
    async migrate() {
        console.log('🔄 开始数据库迁移：整合监控表');
        console.log('=' .repeat(50));

        try {
            // 1. 连接数据库
            await this.connectDatabase();

            // 2. 检查当前表结构
            await this.checkCurrentTables();

            // 3. 备份现有数据
            await this.backupExistingData();

            // 4. 创建新的表结构
            await this.createNewTableStructure();

            // 5. 迁移数据
            await this.migrateData();

            // 6. 验证数据迁移
            await this.verifyMigration();

            // 7. 清理旧表（可选）
            await this.cleanupOldTables();

            console.log('✅ 数据库迁移完成！');

        } catch (error) {
            console.error('❌ 数据库迁移失败:', error.message);
            console.error('💡 建议：请检查数据库连接和权限');
            process.exit(1);
        }
    }

    /**
     * 连接数据库
     */
    async connectDatabase() {
        console.log('📡 连接数据库...');
        
        const success = await databaseManager.initialize();
        if (!success) {
            throw new Error('数据库连接失败');
        }
        
        console.log('✅ 数据库连接成功');
    }

    /**
     * 检查当前表结构
     */
    async checkCurrentTables() {
        console.log('🔍 检查当前表结构...');

        const result = await databaseManager.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('monitor_state', 'monitor_stats')
            ORDER BY table_name
        `);

        const existingTables = result.rows.map(row => row.table_name);
        console.log('📋 现有监控相关表:', existingTables);

        this.hasMonitorState = existingTables.includes('monitor_state');
        this.hasMonitorStats = existingTables.includes('monitor_stats');

        if (!this.hasMonitorState && !this.hasMonitorStats) {
            console.log('ℹ️  没有找到需要迁移的表，跳过迁移');
            return;
        }

        console.log(`📊 迁移计划:`);
        console.log(`   - monitor_state: ${this.hasMonitorState ? '存在' : '不存在'}`);
        console.log(`   - monitor_stats: ${this.hasMonitorStats ? '存在' : '不存在'}`);
    }

    /**
     * 备份现有数据
     */
    async backupExistingData() {
        console.log('💾 备份现有数据...');

        this.backupData = {
            monitor_state: [],
            monitor_stats: []
        };

        // 备份 monitor_state 表数据
        if (this.hasMonitorState) {
            try {
                const stateResult = await databaseManager.query('SELECT * FROM monitor_state');
                this.backupData.monitor_state = stateResult.rows;
                console.log(`✅ 备份 monitor_state: ${stateResult.rows.length} 条记录`);
            } catch (error) {
                console.log(`⚠️  monitor_state 表可能不存在或为空`);
            }
        }

        // 备份 monitor_stats 表数据
        if (this.hasMonitorStats) {
            try {
                const statsResult = await databaseManager.query('SELECT * FROM monitor_stats');
                this.backupData.monitor_stats = statsResult.rows;
                console.log(`✅ 备份 monitor_stats: ${statsResult.rows.length} 条记录`);
            } catch (error) {
                console.log(`⚠️  monitor_stats 表可能不存在或为空`);
            }
        }
    }

    /**
     * 创建新的表结构
     */
    async createNewTableStructure() {
        console.log('🏗️  创建新的表结构...');

        // 删除旧的 monitor_state 表（如果存在）
        if (this.hasMonitorState) {
            await databaseManager.query('DROP TABLE IF EXISTS monitor_state CASCADE');
            console.log('🗑️  删除旧的 monitor_state 表');
        }

        // 删除旧的 monitor_stats 表（如果存在）
        if (this.hasMonitorStats) {
            await databaseManager.query('DROP TABLE IF EXISTS monitor_stats CASCADE');
            console.log('🗑️  删除旧的 monitor_stats 表');
        }

        // 创建新的整合表
        const createTableSQL = `
            CREATE TABLE monitor_state (
                monitor_user VARCHAR(50) PRIMARY KEY,
                -- 状态信息
                last_tweet_id VARCHAR(50),
                last_check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                -- 统计信息
                total_tweets INTEGER DEFAULT 0,
                success_count INTEGER DEFAULT 0,
                error_count INTEGER DEFAULT 0,
                rate_limit_hits INTEGER DEFAULT 0,
                last_success_time TIMESTAMP,
                -- 元数据
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await databaseManager.query(createTableSQL);
        console.log('✅ 创建新的 monitor_state 表');

        // 创建索引
        await databaseManager.query('CREATE INDEX IF NOT EXISTS idx_monitor_state_time ON monitor_state(last_check_time)');
        await databaseManager.query('CREATE INDEX IF NOT EXISTS idx_monitor_state_success ON monitor_state(last_success_time)');
        console.log('✅ 创建表索引');
    }

    /**
     * 迁移数据
     */
    async migrateData() {
        console.log('📦 迁移数据到新表...');

        // 合并数据：以 monitor_user 为键
        const mergedData = new Map();

        // 处理 monitor_state 数据
        this.backupData.monitor_state.forEach(row => {
            mergedData.set(row.monitor_user, {
                monitor_user: row.monitor_user,
                last_tweet_id: row.last_tweet_id,
                last_check_time: row.last_check_time,
                total_tweets: 0,
                success_count: 0,
                error_count: 0,
                rate_limit_hits: 0,
                last_success_time: null,
                created_at: row.created_at || new Date(),
                updated_at: row.updated_at || new Date()
            });
        });

        // 处理 monitor_stats 数据
        this.backupData.monitor_stats.forEach(row => {
            const existing = mergedData.get(row.monitor_user) || {
                monitor_user: row.monitor_user,
                last_tweet_id: null,
                last_check_time: row.last_check_time || new Date(),
                created_at: row.created_at || new Date(),
                updated_at: row.updated_at || new Date()
            };

            // 合并统计信息
            existing.total_tweets = row.total_tweets || 0;
            existing.success_count = row.success_count || 0;
            existing.error_count = row.error_count || 0;
            existing.rate_limit_hits = row.rate_limit_hits || 0;
            existing.last_success_time = row.last_success_time;

            mergedData.set(row.monitor_user, existing);
        });

        // 插入合并后的数据
        let insertedCount = 0;
        for (const [monitorUser, data] of mergedData.entries()) {
            const insertSQL = `
                INSERT INTO monitor_state (
                    monitor_user, last_tweet_id, last_check_time,
                    total_tweets, success_count, error_count, rate_limit_hits,
                    last_success_time, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `;

            await databaseManager.query(insertSQL, [
                data.monitor_user,
                data.last_tweet_id,
                data.last_check_time,
                data.total_tweets,
                data.success_count,
                data.error_count,
                data.rate_limit_hits,
                data.last_success_time,
                data.created_at,
                data.updated_at
            ]);

            insertedCount++;
        }

        console.log(`✅ 迁移完成: ${insertedCount} 条记录`);
    }

    /**
     * 验证数据迁移
     */
    async verifyMigration() {
        console.log('🔍 验证数据迁移...');

        // 检查新表的记录数
        const result = await databaseManager.query('SELECT COUNT(*) as count FROM monitor_state');
        const newCount = parseInt(result.rows[0].count);

        // 计算原始数据总数
        const originalStateCount = this.backupData.monitor_state.length;
        const originalStatsCount = this.backupData.monitor_stats.length;
        
        // 计算唯一用户数（因为可能有重复的monitor_user）
        const uniqueUsers = new Set([
            ...this.backupData.monitor_state.map(row => row.monitor_user),
            ...this.backupData.monitor_stats.map(row => row.monitor_user)
        ]);
        const expectedCount = uniqueUsers.size;

        console.log(`📊 数据验证结果:`);
        console.log(`   - 原 monitor_state: ${originalStateCount} 条`);
        console.log(`   - 原 monitor_stats: ${originalStatsCount} 条`);
        console.log(`   - 唯一用户数: ${expectedCount} 个`);
        console.log(`   - 新表记录数: ${newCount} 条`);

        if (newCount === expectedCount) {
            console.log('✅ 数据迁移验证通过');
        } else {
            console.log('⚠️  数据数量不匹配，请检查迁移结果');
        }

        // 显示迁移后的数据样本
        const sampleResult = await databaseManager.query('SELECT * FROM monitor_state LIMIT 3');
        if (sampleResult.rows.length > 0) {
            console.log('📋 迁移后数据样本:');
            sampleResult.rows.forEach((row, index) => {
                console.log(`   ${index + 1}. ${row.monitor_user}: 推文${row.total_tweets}条, 成功${row.success_count}次`);
            });
        }
    }

    /**
     * 清理旧表（可选）
     */
    async cleanupOldTables() {
        console.log('🧹 清理完成');
        console.log('ℹ️  旧表已在创建新表时删除');
    }

    /**
     * 回滚迁移（紧急情况使用）
     */
    async rollback() {
        console.log('🔄 回滚数据库迁移...');
        console.log('⚠️  警告：这将删除新的表结构并恢复原始数据');

        try {
            // 删除新表
            await databaseManager.query('DROP TABLE IF EXISTS monitor_state CASCADE');

            // 重新创建原始表结构
            if (this.backupData.monitor_state.length > 0) {
                await databaseManager.query(`
                    CREATE TABLE monitor_state (
                        monitor_user VARCHAR(50) PRIMARY KEY,
                        last_tweet_id VARCHAR(50),
                        last_check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 恢复 monitor_state 数据
                for (const row of this.backupData.monitor_state) {
                    await databaseManager.query(
                        'INSERT INTO monitor_state (monitor_user, last_tweet_id, last_check_time) VALUES ($1, $2, $3)',
                        [row.monitor_user, row.last_tweet_id, row.last_check_time]
                    );
                }
            }

            if (this.backupData.monitor_stats.length > 0) {
                await databaseManager.query(`
                    CREATE TABLE monitor_stats (
                        monitor_user VARCHAR(50) PRIMARY KEY,
                        total_tweets INTEGER DEFAULT 0,
                        success_count INTEGER DEFAULT 0,
                        error_count INTEGER DEFAULT 0,
                        rate_limit_hits INTEGER DEFAULT 0,
                        last_success_time TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // 恢复 monitor_stats 数据
                for (const row of this.backupData.monitor_stats) {
                    await databaseManager.query(`
                        INSERT INTO monitor_stats (
                            monitor_user, total_tweets, success_count, error_count, 
                            rate_limit_hits, last_success_time, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [
                        row.monitor_user, row.total_tweets, row.success_count, row.error_count,
                        row.rate_limit_hits, row.last_success_time, row.created_at, row.updated_at
                    ]);
                }
            }

            console.log('✅ 数据库回滚完成');

        } catch (error) {
            console.error('❌ 数据库回滚失败:', error.message);
            throw error;
        }
    }
}

// 主程序
async function main() {
    const migrator = new DatabaseMigrator();
    
    // 检查命令行参数
    const args = process.argv.slice(2);
    
    if (args.includes('--rollback')) {
        console.log('⚠️  执行回滚操作...');
        await migrator.rollback();
    } else if (args.includes('--help') || args.includes('-h')) {
        console.log(`
数据库迁移工具使用说明：

基本用法：
  npm run migrate              # 执行数据库迁移
  node tools/migrate_database.js

选项：
  --rollback                   # 回滚迁移（紧急情况使用）
  --help, -h                   # 显示帮助信息

示例：
  npm run migrate              # 正常迁移
  npm run migrate -- --rollback  # 回滚迁移

注意事项：
1. 迁移前会自动备份现有数据
2. 迁移过程中会删除旧表并创建新表
3. 建议在非生产环境先测试
4. 如有问题可使用 --rollback 回滚
        `);
        process.exit(0);
    } else {
        await migrator.migrate();
    }
    
    process.exit(0);
}

// 错误处理
process.on('unhandledRejection', (error) => {
    console.error('❌ 未处理的错误:', error);
    process.exit(1);
});

// 执行主程序
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { DatabaseMigrator };