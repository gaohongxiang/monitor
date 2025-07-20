#!/usr/bin/env node

import { XAuthenticator } from '../src/x.js';
import { databaseManager } from '../src/database.js';
import { configManager } from '../src/config.js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 预先认证工具
 * 用于在系统运行前完成所有API凭证的OAuth认证
 */
class AuthenticationTool {
    constructor() {
        this.results = [];
    }

    /**
     * 初始化数据库连接和表结构
     */
    async initializeDatabase() {
        console.log('🔗 初始化数据库连接...');
        
        try {
            const success = await databaseManager.initialize();
            if (!success) {
                throw new Error('数据库初始化失败');
            }
            console.log('✅ 数据库连接成功');
            return true;
        } catch (error) {
            console.error('❌ 数据库初始化失败:', error.message);
            return false;
        }
    }

    /**
     * 认证所有配置的API凭证
     */
    async authenticateAllCredentials() {
        console.log('🔐 开始认证所有API凭证...\n');

        try {
            // 加载配置
            const config = configManager.loadConfig();
            if (!config || !config.monitoredUsers) {
                throw new Error('无法加载用户配置');
            }

            // 收集所有凭证
            const allCredentials = [];
            for (const user of config.monitoredUsers) {
                for (const credential of user.apiCredentials) {
                    allCredentials.push({
                        ...credential,
                        monitorUser: user.xMonitorNickName
                    });
                }
            }

            console.log(`📋 找到 ${allCredentials.length} 个API凭证需要认证\n`);

            if (allCredentials.length === 0) {
                console.log('⚠️  没有找到需要认证的API凭证');
                return;
            }

            // 逐个认证
            for (let i = 0; i < allCredentials.length; i++) {
                const credential = allCredentials[i];
                const progress = `[${i + 1}/${allCredentials.length}]`;
                
                console.log(`${progress} 认证凭证: ${credential.id} (${credential.monitorUser})`);
                
                const result = await this.authenticateCredential(credential);
                this.results.push(result);
                
                if (result.success) {
                    if (result.skipped) {
                        console.log(`⚠️  ${progress} 已跳过（已有有效token）\n`);
                    } else {
                        console.log(`✅ ${progress} 认证成功\n`);
                    }
                } else {
                    console.log(`❌ ${progress} 认证失败: ${result.error}\n`);
                }

                // 在认证之间添加短暂延迟，避免过于频繁的请求
                if (i < allCredentials.length - 1) {
                    console.log('   ⏳ 等待2秒后继续下一个认证...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            // 显示认证结果摘要
            this.displayResults();

        } catch (error) {
            console.error('❌ 认证过程出错:', error.message);
            console.error('💡 请检查环境变量配置是否正确');
        }
    }

    /**
     * 认证单个凭证
     */
    async authenticateCredential(credential) {
        const result = {
            credentialId: credential.id,
            monitorUser: credential.monitorUser,
            success: false,
            error: null,
            authTime: new Date().toISOString()
        };

        try {
            // 检查是否已经认证
            const existingToken = await databaseManager.getRefreshToken(credential.xUserName);
            if (existingToken) {
                console.log(`   ⚠️  用户已存在refreshToken，跳过认证`);
                result.success = true;
                result.skipped = true;
                return result;
            }

            // 创建认证器
            console.log(`   🌐 创建OAuth认证器...`);
            const authenticator = await XAuthenticator.create({
                xClientId: credential.xClientId,
                xClientSecret: credential.xClientSecret,
                browserId: credential.bitbrowserId,
                socksProxyUrl: credential.socksProxyUrl
            });

            if (!authenticator) {
                result.error = '创建OAuth认证器失败';
                return result;
            }

            // 设置凭证信息
            authenticator.credential = {
                xRedirectUri: credential.xRedirectUri
            };

            console.log(`   🌐 启动OAuth认证流程...`);
            
            // 执行认证
            const authSuccess = await authenticator.authorizeAndSaveToken({
                xUserName: credential.xUserName
            });
            
            if (authSuccess !== false) {
                result.success = true;
                console.log(`   💾 OAuth认证完成，refreshToken已保存`);
            } else {
                result.error = 'OAuth认证流程失败';
            }

        } catch (error) {
            result.error = error.message;
        }

        return result;
    }

    /**
     * 检查所有凭证的认证状态
     */
    async checkAuthenticationStatus() {
        console.log('📋 检查认证状态...\n');

        try {
            // 加载配置
            const config = configManager.loadConfig();
            if (!config || !config.monitoredUsers) {
                throw new Error('无法加载用户配置');
            }

            // 收集所有凭证
            const allCredentials = [];
            for (const user of config.monitoredUsers) {
                for (const credential of user.apiCredentials) {
                    allCredentials.push({
                        ...credential,
                        monitorUser: user.xMonitorNickName
                    });
                }
            }

            if (allCredentials.length === 0) {
                console.log('⚠️  没有找到任何API凭证配置');
                return;
            }

            console.log(`📊 认证状态报告:`);
            console.log('='.repeat(60));

            let authenticatedCount = 0;
            const statusDetails = [];
            
            for (const credential of allCredentials) {
                const tokenData = await databaseManager.getRefreshTokenWithDetails(credential.xUserName);
                
                if (tokenData && tokenData.refresh_token) {
                    const authTime = tokenData.auth_time ? new Date(tokenData.auth_time).toLocaleString('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : '未知';
                    
                    const status = tokenData.auth_status || 'active';
                    const statusIcon = status === 'active' ? '✅' : '⚠️';
                    
                    console.log(`${statusIcon} ${credential.xUserName} (${credential.monitorUser})`);
                    console.log(`   状态: ${status} | 认证时间: ${authTime}`);
                    
                    statusDetails.push({
                        id: credential.xUserName,
                        user: credential.monitorUser,
                        authenticated: true,
                        status: status,
                        authTime: authTime
                    });
                    
                    authenticatedCount++;
                } else {
                    console.log(`❌ ${credential.xUserName} (${credential.monitorUser})`);
                    console.log(`   状态: 未认证 | 需要运行认证流程`);
                    
                    statusDetails.push({
                        id: credential.xUserName,
                        user: credential.monitorUser,
                        authenticated: false,
                        status: 'not_authenticated',
                        authTime: null
                    });
                }
                console.log('');
            }

            console.log('='.repeat(60));
            console.log(`📈 统计摘要:`);
            console.log(`   - 总凭证数: ${allCredentials.length}`);
            console.log(`   - 已认证: ${authenticatedCount} 个`);
            console.log(`   - 未认证: ${allCredentials.length - authenticatedCount} 个`);
            console.log(`   - 认证率: ${Math.round((authenticatedCount / allCredentials.length) * 100)}%`);

            // 按监控用户分组显示
            const userGroups = {};
            statusDetails.forEach(detail => {
                if (!userGroups[detail.user]) {
                    userGroups[detail.user] = { total: 0, authenticated: 0 };
                }
                userGroups[detail.user].total++;
                if (detail.authenticated) {
                    userGroups[detail.user].authenticated++;
                }
            });

            console.log(`\n👥 按监控用户分组:`);
            Object.entries(userGroups).forEach(([user, stats]) => {
                const percentage = Math.round((stats.authenticated / stats.total) * 100);
                const statusIcon = stats.authenticated === stats.total ? '✅' : '⚠️';
                console.log(`   ${statusIcon} ${user}: ${stats.authenticated}/${stats.total} (${percentage}%)`);
            });

            console.log('\n' + '='.repeat(60));

            if (authenticatedCount < allCredentials.length) {
                console.log('💡 下一步操作:');
                console.log('   - 运行 `npm run auth` 来认证所有未认证的凭证');
                console.log('   - 或运行 `npm run auth:user <用户名>` 来认证特定用户的凭证');
                console.log('   - 确保环境变量 API_CREDENTIALS 配置正确');
            } else {
                console.log('🎉 所有凭证都已认证完成！');
                console.log('💡 现在可以运行 `npm start` 启动监控系统');
            }

        } catch (error) {
            console.error('❌ 检查认证状态失败:', error.message);
            console.error('💡 请检查数据库连接和环境变量配置');
        }
    }

    /**
     * 显示认证结果摘要
     */
    displayResults() {
        console.log('\n📊 认证结果摘要:');
        console.log('='.repeat(50));

        const successful = this.results.filter(r => r.success);
        const failed = this.results.filter(r => !r.success);
        const skipped = this.results.filter(r => r.skipped);

        console.log(`✅ 成功: ${successful.length} 个`);
        console.log(`⚠️  跳过: ${skipped.length} 个 (已有token)`);
        console.log(`❌ 失败: ${failed.length} 个`);

        if (failed.length > 0) {
            console.log('\n❌ 失败的凭证:');
            failed.forEach(result => {
                console.log(`   - ${result.credentialId}: ${result.error}`);
            });
        }

        console.log('='.repeat(50));

        if (failed.length === 0) {
            console.log('🎉 所有凭证认证完成！现在可以启动监控系统了。');
        } else {
            console.log('⚠️  部分凭证认证失败，请检查配置后重试。');
        }
    }
}

/**
 * 主函数
 */
async function main() {
    const tool = new AuthenticationTool();
    
    // 获取命令行参数
    const command = process.argv[2];
    
    // 初始化数据库
    const dbInitialized = await tool.initializeDatabase();
    if (!dbInitialized) {
        process.exit(1);
    }

    // 根据命令执行不同操作
    switch (command) {
        case 'check':
            await tool.checkAuthenticationStatus();
            break;
        default:
            await tool.authenticateAllCredentials();
            break;
    }
}

// 如果直接运行此文件，执行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('认证工具执行失败:', error);
        process.exit(1);
    });
}

export { AuthenticationTool };