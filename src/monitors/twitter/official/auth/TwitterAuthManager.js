#!/usr/bin/env node

import { TwitterOAuth } from './TwitterOAuth.js';
import { unifiedDatabaseManager } from '../../../../core/database.js';
import { unifiedConfigManager } from '../../../../core/config.js';

/**
 * Twitter认证管理工具
 * 用于在系统运行前完成Twitter API凭证的OAuth认证
 */
export class TwitterAuthManager {
    constructor() {
        this.results = [];
    }

    /**
     * 初始化数据库连接
     */
    async initializeDatabase() {
        console.log('🔗 初始化数据库连接...');
        
        // 加载配置
        const config = unifiedConfigManager.loadConfig();
        if (!config) {
            throw new Error('配置加载失败');
        }

        // 初始化数据库
        const success = await unifiedDatabaseManager.initialize(
            config.shared.database, 
            ['twitter-official']
        );
        
        if (!success) {
            throw new Error('数据库初始化失败');
        }

        console.log('✅ 数据库连接成功');
    }

    /**
     * 认证所有Twitter API凭证
     */
    async authenticateAllCredentials() {
        console.log('🔐 开始认证所有Twitter API凭证...\n');

        try {
            // 加载Twitter配置
            const twitterConfig = unifiedConfigManager.getModuleConfig('twitter-official');
            if (!twitterConfig || !twitterConfig.apiCredentials) {
                throw new Error('无法加载Twitter配置');
            }

            const allCredentials = twitterConfig.apiCredentials;
            console.log(`📋 找到 ${allCredentials.length} 个Twitter API凭证需要认证\n`);

            if (allCredentials.length === 0) {
                console.log('⚠️  没有找到需要认证的Twitter API凭证');
                return;
            }

            // 检查现有的认证状态
            const existingTokens = await this.getExistingRefreshTokens();
            console.log(`💾 数据库中已有 ${existingTokens.size} 个refresh token\n`);

            let authenticatedCount = 0;
            let skippedCount = 0;
            let failedCount = 0;

            // 逐个处理凭证
            for (let i = 0; i < allCredentials.length; i++) {
                const credential = allCredentials[i];
                const { twitterUserName } = credential;

                console.log(`\n📋 处理凭证 ${i + 1}/${allCredentials.length}: ${twitterUserName}`);

                // 检查是否已有有效的refresh token
                if (existingTokens.has(twitterUserName)) {
                    console.log(`   ✅ ${twitterUserName} 已有refresh token，跳过认证`);
                    skippedCount++;
                    this.results.push({
                        username: twitterUserName,
                        status: 'skipped',
                        message: '已有有效的refresh token'
                    });
                    continue;
                }

                // 执行OAuth认证
                try {
                    const success = await this.authenticateCredential(credential);
                    if (success) {
                        authenticatedCount++;
                        this.results.push({
                            username: twitterUserName,
                            status: 'success',
                            message: 'OAuth认证成功'
                        });
                    } else {
                        failedCount++;
                        this.results.push({
                            username: twitterUserName,
                            status: 'failed',
                            message: 'OAuth认证失败'
                        });
                    }
                } catch (error) {
                    console.error(`   ❌ ${twitterUserName} 认证出错:`, error.message);
                    failedCount++;
                    this.results.push({
                        username: twitterUserName,
                        status: 'error',
                        message: error.message
                    });
                }
            }

            // 显示认证结果摘要
            this.displayAuthenticationSummary(authenticatedCount, skippedCount, failedCount, allCredentials.length);

        } catch (error) {
            console.error('❌ 认证过程出错:', error.message);
            throw error;
        }
    }

    /**
     * 认证单个凭证
     * @private
     * @param {Object} credential - API凭证
     * @returns {Promise<boolean>} 是否认证成功
     */
    async authenticateCredential(credential) {
        const {
            twitterClientId,
            twitterClientSecret,
            twitterUserName,
            twitterRedirectUri,
            browserId,
            socksProxyUrl
        } = credential;

        console.log(`   🔐 开始OAuth认证: ${twitterUserName}`);

        let oauthHandler = null;
        try {
            // 创建OAuth处理器
            oauthHandler = await TwitterOAuth.create({
                twitterClientId,
                twitterClientSecret,
                browserId,
                socksProxyUrl
            });

            // 执行认证流程
            const success = await oauthHandler.authorizeAndSaveToken({
                twitterUserName,
                twitterRedirectUri
            }, unifiedDatabaseManager);

            return success;

        } catch (error) {
            console.error(`   ❌ ${twitterUserName} OAuth认证失败:`, error.message);
            return false;
        } finally {
            // 清理资源
            if (oauthHandler) {
                await oauthHandler.cleanup();
            }
        }
    }

    /**
     * 获取现有的refresh token
     * @private
     * @returns {Promise<Set<string>>} 已有token的用户名集合
     */
    async getExistingRefreshTokens() {
        try {
            const result = await unifiedDatabaseManager.pool.query(`
                SELECT twitter_user_name 
                FROM twitter_credentials 
                WHERE refresh_token IS NOT NULL 
                AND refresh_token != ''
            `);

            return new Set(result.rows.map(row => row.twitter_user_name));
        } catch (error) {
            console.warn('⚠️  获取现有refresh token失败:', error.message);
            return new Set();
        }
    }

    /**
     * 显示认证结果摘要
     * @private
     */
    displayAuthenticationSummary(authenticatedCount, skippedCount, failedCount, totalCount) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 Twitter API凭证认证结果摘要:');
        console.log(`   ✅ 新认证成功: ${authenticatedCount}`);
        console.log(`   ⏭️  跳过 (已有token): ${skippedCount}`);
        console.log(`   ❌ 认证失败: ${failedCount}`);
        console.log(`   📋 总计: ${totalCount}`);

        const successRate = Math.round(((authenticatedCount + skippedCount) / totalCount) * 100);
        console.log(`   📈 成功率: ${successRate}%`);

        // 按监控用户分组显示
        const userGroups = {};
        this.results.forEach(result => {
            const user = result.username;
            if (!userGroups[user]) {
                userGroups[user] = { total: 0, authenticated: 0 };
            }
            userGroups[user].total++;
            if (result.status === 'success' || result.status === 'skipped') {
                userGroups[user].authenticated++;
            }
        });

        console.log(`\n👥 按Twitter监控用户分组:`);
        Object.entries(userGroups).forEach(([user, stats]) => {
            const percentage = Math.round((stats.authenticated / stats.total) * 100);
            const statusIcon = stats.authenticated === stats.total ? '✅' : '⚠️';
            console.log(`   ${statusIcon} ${user}: ${stats.authenticated}/${stats.total} (${percentage}%)`);
        });

        console.log('\n' + '='.repeat(60));

        if (authenticatedCount + skippedCount < totalCount) {
            console.log('💡 下一步操作:');
            console.log('   - 启动BitBrowser指纹浏览器');
            console.log('   - 运行 `npm run twitter:official:refresh-token:auth` 来进行刷新令牌认证');
            console.log('   - 确保环境变量 API_CREDENTIALS 配置正确');
        } else {
            console.log('🎉 所有Twitter凭证都已认证完成！');
            console.log('💡 现在可以运行 `npm run dev` 启动监控系统');
        }
    }

    /**
     * 检查认证状态
     */
    async checkAuthenticationStatus() {
        console.log('🔍 检查Twitter API凭证认证状态...\n');

        try {
            // 加载配置
            const twitterConfig = unifiedConfigManager.getModuleConfig('twitter-official');
            if (!twitterConfig || !twitterConfig.apiCredentials) {
                throw new Error('无法加载Twitter配置');
            }

            const allCredentials = twitterConfig.apiCredentials;
            const existingTokens = await this.getExistingRefreshTokens();

            console.log(`📋 配置的凭证数量: ${allCredentials.length}`);
            console.log(`💾 已认证的凭证数量: ${existingTokens.size}`);

            // 显示详细状态
            allCredentials.forEach((credential, index) => {
                const { twitterUserName } = credential;
                const isAuthenticated = existingTokens.has(twitterUserName);
                const statusIcon = isAuthenticated ? '✅' : '❌';
                console.log(`   ${statusIcon} ${index + 1}. ${twitterUserName} - ${isAuthenticated ? '已认证' : '未认证'}`);
            });

            const authenticationRate = Math.round((existingTokens.size / allCredentials.length) * 100);
            console.log(`\n📈 认证完成率: ${authenticationRate}%`);

            if (existingTokens.size < allCredentials.length) {
                console.log('\n💡 需要认证的凭证:');
                allCredentials.forEach((credential, index) => {
                    const { twitterUserName } = credential;
                    if (!existingTokens.has(twitterUserName)) {
                        console.log(`   🔐 ${index + 1}. ${twitterUserName}`);
                    }
                });
                console.log('\n运行 `npm run twitter:official:refresh-token:auth` 来进行认证');
            } else {
                console.log('\n🎉 所有凭证都已认证完成！');
            }

        } catch (error) {
            console.error('❌ 检查认证状态失败:', error.message);
            throw error;
        }
    }
}
