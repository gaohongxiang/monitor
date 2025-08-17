#!/usr/bin/env node

/**
 * Twitter OpenAPI 凭证管理脚本
 * 用于添加、更新、查看和删除OpenAPI凭证
 */

import { TwitterCredentialsManager } from '../shared/index.js';
import { unifiedDatabaseManager } from '../../../core/database.js';
import dotenv from 'dotenv';
import readline from 'readline';

// 加载环境变量
dotenv.config();

class OpenApiCredentialsManager {
    constructor() {
        this.credentialsManager = new TwitterCredentialsManager();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * 询问用户输入
     */
    async askQuestion(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    /**
     * 显示主菜单
     */
    async showMainMenu() {
        console.log('\n🔐 Twitter OpenAPI 凭证管理器');
        console.log('================================');
        console.log('1. 添加/更新用户凭证');
        console.log('2. 查看所有凭证');
        console.log('3. 删除用户凭证');
        console.log('4. 检查ct0令牌状态');
        console.log('5. 退出');
        console.log('================================');
        
        const choice = await this.askQuestion('请选择操作 (1-5): ');
        return choice;
    }

    /**
     * 添加或更新用户凭证
     */
    async addOrUpdateCredentials() {
        console.log('\n📝 添加/更新OpenAPI凭证');
        console.log('-------------------------');
        
        const username = await this.askQuestion('用户名 (如: elonmusk): ');
        if (!username) {
            console.log('❌ 用户名不能为空');
            return;
        }

        const authToken = await this.askQuestion('Auth Token: ');
        if (!authToken) {
            console.log('❌ Auth Token不能为空');
            return;
        }

        const ct0Token = await this.askQuestion('CT0 Token: ');
        if (!ct0Token) {
            console.log('❌ CT0 Token不能为空');
            return;
        }

        console.log('\n🔄 保存凭证到数据库...');
        
        const success = await this.credentialsManager.updateOpenApiCredentials(username, {
            auth_token: authToken,
            ct0_token: ct0Token,
            ct0_updated_at: new Date().toISOString()
        });

        if (success) {
            console.log(`✅ 用户 @${username} 的OpenAPI凭证已保存`);
        } else {
            console.log('❌ 保存凭证失败');
        }
    }

    /**
     * 查看所有凭证
     */
    async viewAllCredentials() {
        console.log('\n📋 所有OpenAPI凭证');
        console.log('-------------------');

        try {
            if (!await this.credentialsManager.db.ensureConnection()) {
                console.log('❌ 数据库连接失败');
                return;
            }

            const result = await this.credentialsManager.db.pool.query(`
                SELECT username, 
                       CASE WHEN openapi_auth_token IS NOT NULL THEN '✅ 已配置' ELSE '❌ 未配置' END as auth_status,
                       CASE WHEN openapi_ct0_token IS NOT NULL THEN '✅ 已配置' ELSE '❌ 未配置' END as ct0_status,
                       openapi_ct0_updated_at,
                       created_at,
                       updated_at
                FROM twitter_credentials 
                WHERE openapi_auth_token IS NOT NULL OR openapi_ct0_token IS NOT NULL
                ORDER BY updated_at DESC
            `);

            if (result.rows.length === 0) {
                console.log('📭 暂无OpenAPI凭证');
                return;
            }

            result.rows.forEach((row, index) => {
                console.log(`\n${index + 1}. 用户: @${row.username}`);
                console.log(`   Auth Token: ${row.auth_status}`);
                console.log(`   CT0 Token: ${row.ct0_status}`);
                console.log(`   CT0更新时间: ${row.openapi_ct0_updated_at || '未知'}`);
                console.log(`   创建时间: ${row.created_at}`);
                console.log(`   更新时间: ${row.updated_at}`);
            });

        } catch (error) {
            console.error('❌ 查看凭证失败:', error.message);
        }
    }

    /**
     * 删除用户凭证
     */
    async deleteCredentials() {
        console.log('\n🗑️  删除OpenAPI凭证');
        console.log('-------------------');
        
        const username = await this.askQuestion('要删除的用户名: ');
        if (!username) {
            console.log('❌ 用户名不能为空');
            return;
        }

        const confirm = await this.askQuestion(`确认删除用户 @${username} 的OpenAPI凭证? (y/N): `);
        if (confirm.toLowerCase() !== 'y') {
            console.log('❌ 操作已取消');
            return;
        }

        try {
            if (!await this.credentialsManager.db.ensureConnection()) {
                console.log('❌ 数据库连接失败');
                return;
            }

            const result = await this.credentialsManager.db.pool.query(`
                UPDATE twitter_credentials 
                SET openapi_auth_token = NULL,
                    openapi_ct0_token = NULL,
                    openapi_ct0_updated_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE username = $1
            `, [username]);

            if (result.rowCount > 0) {
                console.log(`✅ 用户 @${username} 的OpenAPI凭证已删除`);
            } else {
                console.log(`⚠️  未找到用户 @${username} 的凭证`);
            }

        } catch (error) {
            console.error('❌ 删除凭证失败:', error.message);
        }
    }

    /**
     * 检查ct0令牌状态
     */
    async checkCt0Status() {
        console.log('\n🔍 检查CT0令牌状态');
        console.log('------------------');

        try {
            if (!await this.credentialsManager.db.ensureConnection()) {
                console.log('❌ 数据库连接失败');
                return;
            }

            const result = await this.credentialsManager.db.pool.query(`
                SELECT username, 
                       openapi_ct0_updated_at,
                       CASE 
                           WHEN openapi_ct0_updated_at IS NULL THEN '❌ 从未更新'
                           WHEN openapi_ct0_updated_at < NOW() - INTERVAL '20 hours' THEN '⚠️  需要刷新'
                           ELSE '✅ 正常'
                       END as status
                FROM twitter_credentials 
                WHERE openapi_ct0_token IS NOT NULL
                ORDER BY openapi_ct0_updated_at DESC
            `);

            if (result.rows.length === 0) {
                console.log('📭 暂无CT0令牌');
                return;
            }

            result.rows.forEach((row, index) => {
                const lastUpdate = row.openapi_ct0_updated_at ? 
                    new Date(row.openapi_ct0_updated_at).toLocaleString() : '从未更新';
                
                console.log(`\n${index + 1}. 用户: @${row.username}`);
                console.log(`   状态: ${row.status}`);
                console.log(`   最后更新: ${lastUpdate}`);
            });

        } catch (error) {
            console.error('❌ 检查状态失败:', error.message);
        }
    }

    /**
     * 运行主程序
     */
    async run() {
        try {
            // 初始化数据库
            await unifiedDatabaseManager.initialize();
            await this.credentialsManager.initializeTables();

            while (true) {
                const choice = await this.showMainMenu();

                switch (choice) {
                    case '1':
                        await this.addOrUpdateCredentials();
                        break;
                    case '2':
                        await this.viewAllCredentials();
                        break;
                    case '3':
                        await this.deleteCredentials();
                        break;
                    case '4':
                        await this.checkCt0Status();
                        break;
                    case '5':
                        console.log('\n👋 再见！');
                        this.rl.close();
                        process.exit(0);
                        break;
                    default:
                        console.log('❌ 无效选择，请重新输入');
                }

                // 等待用户按回车继续
                await this.askQuestion('\n按回车键继续...');
            }

        } catch (error) {
            console.error('❌ 程序运行失败:', error.message);
            this.rl.close();
            process.exit(1);
        }
    }
}

// 运行程序
const manager = new OpenApiCredentialsManager();
manager.run();
