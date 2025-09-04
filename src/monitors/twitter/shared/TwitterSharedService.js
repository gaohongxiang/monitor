/**
 * Twitter共享服务类
 * 提供两个Twitter监控模块的共同功能
 */

import { TwitterRecordsManager, TwitterCredentialsManager } from './index.js';

export class TwitterSharedService {
    constructor() {
        this.recordsManager = new TwitterRecordsManager();
        this.credentialsManager = new TwitterCredentialsManager();
        this.userIdCache = new Map(); // 内存缓存: username → userId

        // 初始化关键字过滤配置
        this.initializeKeywordFilter();
    }

    /**
     * 初始化关键字过滤配置
     */
    initializeKeywordFilter() {
        const keywordsEnv = process.env.TWITTER_KEYWORDS || '';
        this.keywords = keywordsEnv.trim()
            ? keywordsEnv.split(',').map(k => k.trim()).filter(k => k.length > 0)
            : [];

        if (this.keywords.length > 0) {
            console.log(`🔍 Twitter关键字过滤已启用: [${this.keywords.join(', ')}]`);
        } else {
            console.log('📢 Twitter关键字过滤未启用，将推送所有推文');
        }
    }

    /**
     * 初始化服务
     */
    async initialize() {
        // 表结构初始化已由统一数据库管理器处理
        // 只需要迁移现有数据
        await this.credentialsManager.migrateExistingData();
    }

    /**
     * 从数据库恢复最后推文ID
     */
    async loadLastTweetIdsFromDatabase(monitoredUsers) {
        console.log('🔄 从数据库恢复最后推文ID...');

        const lastTweetIds = new Map();

        for (const username of monitoredUsers) {
            try {
                const record = await this.recordsManager.getLastTweetId(username);
                if (record && record.last_tweet_id) {
                    lastTweetIds.set(username, record.last_tweet_id);
                    console.log(`   ✅ 恢复 @${username} 最后推文ID: ${record.last_tweet_id}`);
                } else {
                    console.log(`   📭 @${username} 暂无历史记录`);
                }
            } catch (error) {
                console.error(`   ❌ 恢复 @${username} 记录失败:`, error.message);
            }
        }

        return lastTweetIds;
    }

    /**
     * 检查是否为重复推文（基于ID比较）
     */
    async isDuplicateTweet(username, tweetId, lastTweetIds) {
        // 首先检查内存中的记录
        const memoryLastId = lastTweetIds.get(username);
        if (memoryLastId) {
            // 使用BigInt比较，如果新推文ID <= 最后处理的ID，则为重复
            return BigInt(tweetId) <= BigInt(memoryLastId);
        }

        // 如果内存中没有，检查数据库
        const record = await this.recordsManager.getLastTweetId(username);
        if (record && record.last_tweet_id) {
            // 同样使用BigInt比较
            return BigInt(tweetId) <= BigInt(record.last_tweet_id);
        }

        // 没有历史记录，不是重复
        return false;
    }

    /**
     * 处理新推文
     */
    async processNewTweet(username, tweet, userInfo, lastTweetIds, notificationSender) {
        try {
            // 检查重复
            if (await this.isDuplicateTweet(username, tweet.id, lastTweetIds)) {
                console.log(`   📋 @${username} 推文已处理，跳过: ${tweet.id}`);
                return false;
            }

            // 格式化推文
            const formattedTweet = this.formatTweet(tweet, userInfo);

            // 检查关键字过滤
            if (!this.matchesKeywords(formattedTweet.text)) {
                console.log(`   🔍 @${username} 推文不匹配关键字，跳过通知: ${tweet.id}`);
                console.log(`   📝 推文内容: ${formattedTweet.text.substring(0, 50)}...`);

                // 仍然更新记录，避免重复检查
                lastTweetIds.set(username, tweet.id);
                await this.updateLastTweetIdInDatabase(username, tweet.id);

                return false; // 不发送通知，但返回false表示已处理
            }

            // 发送通知
            await notificationSender.sendTweetNotification(username, formattedTweet, userInfo);

            // 更新记录（内存和数据库）
            lastTweetIds.set(username, tweet.id);
            await this.updateLastTweetIdInDatabase(username, tweet.id);

            console.log(`   ✅ @${username} 新推文处理完成: ${tweet.id}`);
            return true;

        } catch (error) {
            console.error(`   ❌ 处理 @${username} 推文失败:`, error.message);
            return false;
        }
    }

    /**
     * 更新数据库中的最后推文ID
     */
    async updateLastTweetIdInDatabase(username, tweetId) {
        try {
            await this.recordsManager.updateLastTweetId(username, tweetId);
            console.log(`   💾 已保存 @${username} 最后推文ID到数据库`);
        } catch (error) {
            console.error(`   ❌ 保存 @${username} 推文ID失败:`, error.message);
        }
    }

    /**
     * 检查推文是否匹配关键字
     */
    matchesKeywords(tweetText) {
        // 如果没有设置关键字，则匹配所有推文
        if (this.keywords.length === 0) {
            return true;
        }

        // 转换为小写进行不区分大小写的匹配
        const lowerText = tweetText.toLowerCase();

        // 检查是否包含任何一个关键字
        return this.keywords.some(keyword =>
            lowerText.includes(keyword.toLowerCase())
        );
    }

    /**
     * 推文格式化
     */
    formatTweet(tweet, userInfo) {
        return {
            id: tweet.id,
            text: tweet.text || tweet.full_text || '',
            createdAt: tweet.created_at,
            author: userInfo.name || userInfo.display_name || '',
            username: userInfo.username || userInfo.screen_name || '',
            url: this.generateTweetUrl(userInfo.username || userInfo.screen_name, tweet.id),
            // 保留原始数据以备扩展
            raw: {
                tweet,
                userInfo
            }
        };
    }

    /**
     * 生成推文URL
     */
    generateTweetUrl(username, tweetId) {
        return `https://twitter.com/${username}/status/${tweetId}`;
    }

    /**
     * 格式化用户信息
     */
    formatUserInfo(userInfo) {
        return {
            id: userInfo.id || userInfo.id_str,
            username: userInfo.username || userInfo.screen_name,
            name: userInfo.name || userInfo.display_name,
            description: userInfo.description || userInfo.bio || '',
            followersCount: userInfo.followers_count || userInfo.public_metrics?.followers_count || 0,
            verified: userInfo.verified || false,
            profileImageUrl: userInfo.profile_image_url || userInfo.avatar_url || ''
        };
    }

    /**
     * 检查推文是否应该被过滤
     */
    shouldFilterTweet(tweet, userInfo) {
        // 过滤转推（如果需要）
        if (tweet.retweeted_status || tweet.text?.startsWith('RT @')) {
            return true;
        }

        // 过滤回复（如果需要）
        if (tweet.in_reply_to_status_id || tweet.text?.startsWith('@')) {
            return true;
        }

        return false;
    }

    /**
     * 获取推文统计信息
     */
    getTweetStats(tweet) {
        return {
            retweets: tweet.retweet_count || tweet.public_metrics?.retweet_count || 0,
            likes: tweet.favorite_count || tweet.public_metrics?.like_count || 0,
            replies: tweet.reply_count || tweet.public_metrics?.reply_count || 0,
            quotes: tweet.quote_count || tweet.public_metrics?.quote_count || 0
        };
    }

    /**
     * 智能获取新推文（适配不同API）
     */
    async getNewTweets(apiClient, username, sinceId, options = {}) {
        const defaultOptions = {
            count: 20,
            includeReplies: false,
            includeRetweets: false,
            ...options
        };

        try {
            let tweets = [];

            // 检查API客户端类型
            if (apiClient.constructor.name === 'TwitterApiClient') {
                // 官方API - 支持since_id参数
                tweets = await apiClient.getUserTweets(username, sinceId, defaultOptions.count);
            } else {
                // OpenAPI - 需要适配器处理
                tweets = await this.getOpenApiTweets(apiClient, username, sinceId, defaultOptions);
            }

            // 确保按ID排序（新推文在前）
            return tweets.sort((a, b) => {
                const diff = BigInt(b.id) - BigInt(a.id);
                return diff > 0n ? 1 : diff < 0n ? -1 : 0;
            });

        } catch (error) {
            console.error(`获取 @${username} 新推文失败:`, error.message);
            return [];
        }
    }

    /**
     * OpenAPI适配器 - 模拟since_id功能
     */
    async getOpenApiTweets(client, username, sinceId, options) {
        try {
            // 使用统一的用户ID获取方法
            const userId = await this.getUserId(client, username);

            // 使用 getUserTweetsAndReplies 替代 getUserTweets 以获取推文和回复
            const tweetsResponse = await client.getTweetApi().getUserTweetsAndReplies({
                userId: userId,
                count: Math.min(40, Number(options.count) * 2) // 获取更多推文用于过滤
            });

            const tweets = tweetsResponse.data?.data || [];

            // 过滤推广内容
            const realTweets = tweets.filter(tweetWrapper => !tweetWrapper.promotedMetadata);

            // 提取推文和回复数据并转换为统一格式
            let allContent = [];

            // 处理每个推文及其回复线程
            realTweets.forEach(tweetWrapper => {
                const tweet = tweetWrapper.tweet;
                const replies = tweetWrapper.replies || [];

                if (!tweet) return;

                // 1. 处理主推文
                const mainTweet = {
                    id: tweet.restId,
                    text: tweet.legacy?.fullText || tweet.legacy?.text || '',
                    full_text: tweet.legacy?.fullText || tweet.legacy?.text || '',
                    created_at: tweet.legacy?.createdAt,
                    author_id: tweet.legacy?.userId,
                    in_reply_to_status_id: tweet.legacy?.inReplyToStatusIdStr,
                    in_reply_to_user_id: tweet.legacy?.inReplyToUserId,
                    in_reply_to_screen_name: tweet.legacy?.inReplyToScreenName,
                    raw: tweet
                };

                // 检查主推文是否符合条件（原创推文或自回复）
                const isMainTweetValid = !mainTweet.in_reply_to_status_id ||
                    mainTweet.in_reply_to_screen_name === username;

                if (isMainTweetValid) {
                    allContent.push(mainTweet);
                }

                // 2. 处理回复线程中的自回复
                replies.forEach(replyWrapper => {
                    const replyTweet = replyWrapper.tweet;
                    const replyUser = replyWrapper.user;

                    if (!replyTweet || !replyUser) return;

                    // 只处理用户自己的回复
                    if (replyUser.legacy?.screenName === username) {
                        const selfReply = {
                            id: replyTweet.restId,
                            text: replyTweet.legacy?.fullText || replyTweet.legacy?.text || '',
                            full_text: replyTweet.legacy?.fullText || replyTweet.legacy?.text || '',
                            created_at: replyTweet.legacy?.createdAt,
                            author_id: replyTweet.legacy?.userId,
                            in_reply_to_status_id: replyTweet.legacy?.inReplyToStatusIdStr || tweet.restId,
                            in_reply_to_user_id: replyTweet.legacy?.inReplyToUserId,
                            in_reply_to_screen_name: replyTweet.legacy?.inReplyToScreenName || username,
                            raw: replyTweet
                        };

                        allContent.push(selfReply);
                    }
                });
            });

            // 如果有sinceId，过滤出更新的内容
            if (sinceId) {
                allContent = allContent.filter(item =>
                    BigInt(item.id) > BigInt(sinceId)
                );
            }

            // 按ID排序（时间顺序）
            allContent.sort((a, b) => {
                const diff = BigInt(a.id) - BigInt(b.id);
                return diff > 0n ? 1 : diff < 0n ? -1 : 0;
            });

            return allContent.slice(0, Number(options.count));

        } catch (error) {
            console.error(`OpenAPI获取推文失败:`, error.message);
            return [];
        }
    }

    /**
     * 构建API排除参数
     */
    buildExcludeParams(options) {
        const exclude = [];
        if (!options.includeReplies) exclude.push('replies');
        if (!options.includeRetweets) exclude.push('retweets');
        return exclude.join(',');
    }

    /**
     * 批量处理新推文
     */
    async processNewTweetsForUser(username, tweets, userInfo, lastTweetIds, notificationSender) {
        let processedCount = 0;
        let latestTweetId = lastTweetIds.get(username);

        // 按ID排序，从旧到新处理
        const sortedTweets = tweets.sort((a, b) => {
            const diff = BigInt(a.id) - BigInt(b.id);
            return diff > 0n ? 1 : diff < 0n ? -1 : 0;
        });

        for (const tweet of sortedTweets) {
            try {
                // 检查是否已处理
                if (await this.isDuplicateTweet(username, tweet.id, lastTweetIds)) {
                    continue;
                }

                // 过滤不需要的推文
                if (this.shouldFilterTweet(tweet, userInfo)) {
                    console.log(`   🚫 过滤推文: ${tweet.id} (转推或回复)`);
                    continue;
                }

                // 处理新推文
                const success = await this.processNewTweet(
                    username,
                    tweet,
                    userInfo,
                    lastTweetIds,
                    notificationSender
                );

                if (success) {
                    processedCount++;
                    latestTweetId = tweet.id;
                }

            } catch (error) {
                console.error(`   ❌ 处理推文 ${tweet.id} 失败:`, error.message);
            }
        }

        return {
            processedCount,
            latestTweetId,
            totalTweets: tweets.length
        };
    }

    /**
     * 统一的用户ID获取方法
     */
    async getUserId(apiClient, username) {
        // 1. 检查内存缓存
        const cachedUserId = this.userIdCache.get(username);
        if (cachedUserId) {
            console.log(`   💾 使用内存缓存: @${username} → ${cachedUserId}`);
            return cachedUserId;
        }

        // 2. 从数据库记录中获取user_id
        const record = await this.recordsManager.getLastTweetId(username);
        if (record && record.user_id) {
            // 更新内存缓存
            this.userIdCache.set(username, record.user_id);
            console.log(`   🗄️  使用数据库缓存: @${username} → ${record.user_id}`);
            return record.user_id;
        }

        // 3. 首次获取，调用API查询
        console.log(`   🌐 首次查询用户: @${username}`);
        const userInfo = await this.fetchUserIdFromApi(apiClient, username);

        // 4. 更新数据库记录中的user_id
        await this.updateUserIdInRecord(username, userInfo.userId);

        // 5. 更新内存缓存
        this.userIdCache.set(username, userInfo.userId);

        console.log(`   ✅ 用户信息已缓存: @${username} → ${userInfo.userId}`);
        return userInfo.userId;
    }

    /**
     * 从API获取用户信息（适配不同API）
     */
    async fetchUserIdFromApi(apiClient, username) {
        if (apiClient.constructor.name === 'TwitterApiClient') {
            // 官方API
            const user = await apiClient.client.v2.userByUsername(username, {
                'user.fields': 'id,name,username,verified'
            });

            return {
                userId: user.data.id,
                displayName: user.data.name,
                username: user.data.username,
                verified: user.data.verified
            };
        } else {
            // OpenAPI
            const userResponse = await apiClient.getUserApi()
                .getUserByScreenName({ screenName: username });

            const user = userResponse.data?.user;
            if (!user) {
                throw new Error(`用户不存在: ${username}`);
            }

            return {
                userId: user.restId,
                displayName: user.legacy?.name || username,
                username: user.legacy?.screenName || username,
                verified: user.legacy?.verified || false
            };
        }
    }

    /**
     * 更新数据库记录中的user_id
     */
    async updateUserIdInRecord(username, userId) {
        try {
            await this.recordsManager.db.pool.query(`
                INSERT INTO twitter_processed_records
                (monitor_user, user_id, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (monitor_user)
                DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    updated_at = CURRENT_TIMESTAMP
            `, [username, userId]);

            console.log(`   💾 已更新数据库中的用户ID: @${username} → ${userId}`);
        } catch (error) {
            console.error(`   ❌ 更新用户ID失败: @${username}`, error.message);
        }
    }

    /**
     * 生成状态报告
     */
    generateStatusReport(monitoredUsers, lastTweetIds, moduleName) {
        const report = {
            module: moduleName,
            monitoredUsers: monitoredUsers.length,
            usersWithRecords: 0,
            lastTweetIds: {}
        };

        monitoredUsers.forEach(username => {
            const lastId = lastTweetIds.get(username);
            if (lastId) {
                report.usersWithRecords++;
                report.lastTweetIds[username] = lastId;
            }
        });

        return report;
    }
}
