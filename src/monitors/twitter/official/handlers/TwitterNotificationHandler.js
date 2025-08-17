/**
 * Twitter通知处理器
 * 专门处理推文通知的发送和格式化
 */
export class TwitterNotificationHandler {
    constructor(sharedServices, twitterService) {
        this.sharedServices = sharedServices;
        this.twitterService = twitterService;
        this.notificationStats = {
            sent: 0,
            failed: 0,
            skipped: 0
        };
    }

    /**
     * 发送推文通知（兼容共享服务接口）
     * @param {string} username - 用户名
     * @param {Object} formattedTweet - 格式化的推文对象
     * @param {Object} userInfo - 用户信息
     */
    async sendTweetNotification(username, formattedTweet, userInfo) {
        try {
            const notifier = this.getNotifier();
            if (!notifier) {
                console.warn('⚠️  通知器未配置，跳过通知发送');
                this.notificationStats.skipped++;
                return;
            }

            // 构建通知消息
            const message = this.buildNotificationMessage(username, formattedTweet, userInfo);

            // 发送通知
            await notifier.sendToRecipients(message, {
                recipients: ['dingtalk']
            });

            console.log(`📢 已发送 @${username} 的推文通知`);
            this.notificationStats.sent++;

        } catch (error) {
            console.error(`❌ 发送推文通知失败 (@${username}):`, error.message);
            this.notificationStats.failed++;
        }
    }

    /**
     * 批量处理推文通知
     * @param {string} username - 用户名
     * @param {Array} tweets - 推文列表
     * @param {Object} userInfo - 用户信息
     * @param {Map} lastTweetIds - 最后推文ID映射
     * @returns {Promise<Object>} 处理结果
     */
    async processTweetNotifications(username, tweets, userInfo, lastTweetIds) {
        if (!tweets || tweets.length === 0) {
            return {
                processed: 0,
                sent: 0,
                skipped: 0,
                failed: 0
            };
        }

        console.log(`📝 处理 @${username} 的 ${tweets.length} 条推文通知`);

        let processed = 0;
        let sent = 0;
        let skipped = 0;
        let failed = 0;

        // 按时间顺序处理推文（从旧到新）
        const sortedTweets = tweets.sort((a, b) => {
            const diff = BigInt(a.id) - BigInt(b.id);
            return diff > 0n ? 1 : diff < 0n ? -1 : 0;
        });

        for (const tweet of sortedTweets) {
            try {
                // 使用共享服务处理推文
                const success = await this.twitterService.processNewTweet(
                    username,
                    tweet,
                    userInfo,
                    lastTweetIds,
                    this
                );

                processed++;
                if (success) {
                    sent++;
                } else {
                    skipped++;
                }

            } catch (error) {
                console.error(`❌ 处理推文失败 (@${username}, ${tweet.id}):`, error.message);
                failed++;
            }
        }

        console.log(`✅ @${username} 推文处理完成: ${processed}/${tweets.length} (发送:${sent}, 跳过:${skipped}, 失败:${failed})`);

        return {
            processed,
            sent,
            skipped,
            failed,
            lastTweetId: sortedTweets.length > 0 ? sortedTweets[sortedTweets.length - 1].id : null
        };
    }

    /**
     * 构建通知消息
     * @private
     * @param {string} username - 用户名
     * @param {Object} formattedTweet - 格式化推文
     * @param {Object} userInfo - 用户信息
     * @returns {string} 通知消息
     */
    buildNotificationMessage(username, formattedTweet, userInfo) {
        const verifiedIcon = userInfo.verified ? '✅' : '';
        const tweetText = this.truncateText(formattedTweet.text, 200);
        
        return `🐦 Twitter官方API监控到新推文

👤 用户: ${userInfo.name || username} (@${username}) ${verifiedIcon}
📝 内容: ${tweetText}
🕒 时间: ${this.formatDate(formattedTweet.createdAt)}
🔗 链接: ${formattedTweet.url}

📊 互动数据:
   ❤️ 点赞: ${formattedTweet.public_metrics?.like_count || 0}
   🔄 转发: ${formattedTweet.public_metrics?.retweet_count || 0}
   💬 回复: ${formattedTweet.public_metrics?.reply_count || 0}

🔍 来源: Twitter官方API (OAuth2认证)`;
    }

    /**
     * 截断文本
     * @private
     * @param {string} text - 原文本
     * @param {number} maxLength - 最大长度
     * @returns {string} 截断后的文本
     */
    truncateText(text, maxLength) {
        if (!text) return '无内容';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * 格式化日期
     * @private
     * @param {string} dateString - 日期字符串
     * @returns {string} 格式化后的日期
     */
    formatDate(dateString) {
        if (!dateString) return '未知时间';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Asia/Shanghai'
            });
        } catch (error) {
            return dateString;
        }
    }

    /**
     * 获取通知器
     * @private
     * @returns {Object|null} 通知器实例
     */
    getNotifier() {
        return this.sharedServices?.notifier || null;
    }

    /**
     * 发送系统状态通知
     * @param {Object} status - 系统状态
     */
    async sendStatusNotification(status) {
        try {
            const notifier = this.getNotifier();
            if (!notifier) {
                return;
            }

            const message = this.buildStatusMessage(status);
            await notifier.sendToRecipients(message, {
                recipients: ['dingtalk']
            });

            console.log('📢 已发送系统状态通知');

        } catch (error) {
            console.error('❌ 发送状态通知失败:', error.message);
        }
    }

    /**
     * 构建状态消息
     * @private
     * @param {Object} status - 状态信息
     * @returns {string} 状态消息
     */
    buildStatusMessage(status) {
        return `📊 Twitter官方API监控状态报告

🕒 检查时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
📋 总检查用户: ${status.totalChecked || 0}
✅ 成功: ${status.successful || 0}
❌ 失败: ${status.failed || 0}
📝 新推文: ${status.newTweets || 0}
📢 发送通知: ${status.sentNotifications || 0}

🔍 来源: Twitter官方API监控系统`;
    }

    /**
     * 获取通知统计信息
     * @returns {Object} 统计信息
     */
    getNotificationStats() {
        return {
            ...this.notificationStats,
            total: this.notificationStats.sent + this.notificationStats.failed + this.notificationStats.skipped
        };
    }

    /**
     * 重置通知统计
     */
    resetNotificationStats() {
        this.notificationStats = {
            sent: 0,
            failed: 0,
            skipped: 0
        };
    }

    /**
     * 发送错误通知
     * @param {string} error - 错误信息
     * @param {string} context - 错误上下文
     */
    async sendErrorNotification(error, context = '') {
        try {
            const notifier = this.getNotifier();
            if (!notifier) {
                return;
            }

            const message = `❌ Twitter官方API监控错误

🕒 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
📍 位置: ${context}
❌ 错误: ${error}

🔍 来源: Twitter官方API监控系统`;

            await notifier.sendToRecipients(message, {
                recipients: ['dingtalk']
            });

            console.log('📢 已发送错误通知');

        } catch (notificationError) {
            console.error('❌ 发送错误通知失败:', notificationError.message);
        }
    }
}
