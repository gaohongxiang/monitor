#!/usr/bin/env node

import { TwitterAuthenticator as TwitterOAuthenticator } from './TwitterApiClient.js';
import { unifiedDatabaseManager } from '../../core/database.js';
import { unifiedConfigManager } from '../../core/config.js';

/**
 * Twitter专用认证工具
 * 用于在系统运行前完成Twitter API凭证的OAuth认证
 */
export class TwitterAuthenticator {
    constructor() {
        this.results = [];
    }

    /**
     * 初始化数据库连接
     */
    async initializeDatabase() {
        console.log('🔗 初始化数据库连接...');
        
        try {
            const success = await unifiedDatabaseManager.initialize();
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
     * 认证所有Twitter API凭证
     */
    async authenticateAllCredentials() {
        console.log('🔐 开始认证所有Twitter API凭证...\n');

        try {
            // 加载Twitter配置
            const twitterConfig = unifiedConfigManager.getModuleConfig('twitter');
            if (!twitterConfig || !twitterConfig.apiCredentials) {
                throw new Error('无法加载Twitter配置');
            }

            const allCredentials = twitterConfig.apiCredentials;
            console.log(`📋 找到 ${allCredentials.length} 个Twitter API凭证需要认证\n`);

            if (allCredentials.length === 0) {
                console.log('⚠️  没有找到需要认证的Twitter API凭证');
                return;
            }

            // 逐个认证
            for (let i = 0; i < allCredentials.length; i++) {
                const credential = allCredentials[i];
                const progress = `[${i + 1}/${allCredentials.length}]`;
                
                console.log(`${progress} 认证Twitter凭证: ${credential.twitterUserName} (${credential.monitorUser})`);
                
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

                // 在认证之间添加短暂延迟
                if (i < allCredentials.length - 1) {
                    console.log('   ⏳ 等待2秒后继续下一个认证...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            this.displayResults();

        } catch (error) {
            console.error('❌ Twitter认证过程出错:', error.message);
            console.error('💡 请检查环境变量配置是否正确');
        }
    }

    /**
     * 认证单个Twitter凭证
     */
    async authenticateCredential(credential) {
        const result = {
            credentialId: credential.twitterUserName,
            monitorUser: credential.monitorUser,
            success: false,
            error: null,
            authTime: new Date().toISOString()
        };

        try {
            // 检查是否已经认证
            const existingToken = await unifiedDatabaseManager.getRefreshToken(credential.twitterUserName);
            if (existingToken) {
                console.log(`   ⚠️  用户已存在refreshToken，跳过认证`);
                result.success = true;
                result.skipped = true;
                return result;
            }

            // 创建Twitter OAuth认证器
            console.log(`   🌐 创建Twitter OAuth认证器...`);
            const authenticator = await TwitterOAuthenticator.create({
                twitterClientId: credential.twitterClientId,
                twitterClientSecret: credential.twitterClientSecret,
                browserId: credential.bitbrowserId,
                socksProxyUrl: credential.socksProxyUrl
            });

            if (!authenticator) {
                result.error = '创建Twitter OAuth认证器失败';
                return result;
            }

            console.log(`   🌐 启动Twitter OAuth认证流程...`);
            
            // 执行认证
            const authSuccess = await authenticator.authorizeAndSaveToken({
                twitterUserName: credential.twitterUserName,
                twitterRedirectUri: credential.twitterRedirectUri
            }, unifiedDatabaseManager);
            
            if (authSuccess !== false) {
                result.success = true;
                console.log(`   💾 Twitter OAuth认证完成，refreshToken已保存`);
            } else {
                result.error = 'Twitter OAuth认证流程失败';
            }

        } catch (error) {
            result.error = error.message;
        }

        return result;
    }

    /**
     * 检查所有Twitter凭证的认证状态
     */
    async checkAuthenticationStatus() {
        console.log('📋 检查Twitter认证状态...\n');

        try {
            // 加载Twitter配置
            const twitterConfig = unifiedConfigManager.getModuleConfig('twitter');
            if (!twitterConfig || !twitterConfig.apiCredentials) {
                throw new Error('无法加载Twitter配置');
            }

            const allCredentials = twitterConfig.apiCredentials;

            if (allCredentials.length === 0) {
                console.log('⚠️  没有找到任何Twitter API凭证配置');
                return;
            }

            console.log(`📊 Twitter认证状态报告:`);
            console.log('='.repeat(60));

            let authenticatedCount = 0;
            const statusDetails = [];
            
            for (const credential of allCredentials) {
                const refreshToken = await unifiedDatabaseManager.getRefreshToken(credential.twitterUserName);

                if (refreshToken) {
                    console.log(`✅ ${credential.twitterUserName} (${credential.monitorUser})`);
                    console.log(`   状态: 已认证 | Token存在`);

                    statusDetails.push({
                        id: credential.twitterUserName,
                        user: credential.monitorUser,
                        authenticated: true,
                        status: 'active'
                    });

                    authenticatedCount++;
                } else {
                    console.log(`❌ ${credential.twitterUserName} (${credential.monitorUser})`);
                    console.log(`   状态: 未认证 | 需要运行认证流程`);

                    statusDetails.push({
                        id: credential.twitterUserName,
                        user: credential.monitorUser,
                        authenticated: false,
                        status: 'not_authenticated'
                    });
                }
                console.log('');
            }

            console.log('='.repeat(60));
            console.log(`📈 Twitter认证统计摘要:`);
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

            console.log(`\n👥 按Twitter监控用户分组:`);
            Object.entries(userGroups).forEach(([user, stats]) => {
                const percentage = Math.round((stats.authenticated / stats.total) * 100);
                const statusIcon = stats.authenticated === stats.total ? '✅' : '⚠️';
                console.log(`   ${statusIcon} ${user}: ${stats.authenticated}/${stats.total} (${percentage}%)`);
            });

            console.log('\n' + '='.repeat(60));

            if (authenticatedCount < allCredentials.length) {
                console.log('💡 下一步操作:');
                console.log('   - 启动BitBrowser指纹浏览器');
                console.log('   - 运行 `npm run twitter:refresh-token:auth` 来进行刷新令牌认证');
                console.log('   - 确保环境变量 API_CREDENTIALS 配置正确');
            } else {
                console.log('🎉 所有Twitter凭证都已认证完成！');
                console.log('💡 现在可以运行 `npm run dev` 启动监控系统');
            }

        } catch (error) {
            console.error('❌ 检查Twitter认证状态失败:', error.message);
            console.error('💡 请检查数据库连接和环境变量配置');
        }
    }

    /**
     * 显示认证结果摘要
     */
    displayResults() {
        console.log('\n📊 Twitter认证结果摘要:');
        console.log('='.repeat(50));

        const successful = this.results.filter(r => r.success);
        const failed = this.results.filter(r => !r.success);
        const skipped = this.results.filter(r => r.skipped);

        console.log(`✅ 成功: ${successful.length} 个`);
        console.log(`⚠️  跳过: ${skipped.length} 个 (已有token)`);
        console.log(`❌ 失败: ${failed.length} 个`);

        if (failed.length > 0) {
            console.log('\n❌ 失败的Twitter凭证:');
            failed.forEach(result => {
                console.log(`   - ${result.credentialId}: ${result.error}`);
            });
        }

        console.log('='.repeat(50));

        if (failed.length === 0) {
            console.log('🎉 所有Twitter凭证认证完成！现在可以启动监控系统了。');
        } else {
            console.log('⚠️  部分Twitter凭证认证失败，请检查配置后重试。');
        }
    }
}