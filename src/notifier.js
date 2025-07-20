import axios from 'axios';
import 'dotenv/config';

/**
 * 钉钉通知管理器
 * 负责发送各种类型的钉钉通知消息
 */
export class DingTalkNotifier {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseUrl = 'https://oapi.dingtalk.com/robot/send';
        this.defaultKeyword = '.';
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2秒
    }

    /**
     * 发送文本消息
     * @param {string} content - 消息内容
     * @param {string} keyword - 关键词
     * @param {boolean} addTimestamp - 是否添加时间戳
     * @returns {Promise<Object>} 响应结果
     */
    async sendTextMessage(content, keyword = null, addTimestamp = true) {
        const finalKeyword = keyword || this.defaultKeyword;
        let finalContent = finalKeyword + '\n' + content;
        
        if (addTimestamp) {
            finalContent += '\n推送时间: ' + getCurrentTime();
        }

        const message = {
            msgtype: "text",
            text: { content: finalContent }
        };

        return await this.sendMessage(message);
    }

    /**
     * 发送Markdown消息
     * @param {string} title - 标题
     * @param {string} content - Markdown内容
     * @returns {Promise<Object>} 响应结果
     */
    async sendMarkdownMessage(title, content) {
        const message = {
            msgtype: "markdown",
            markdown: {
                title: title,
                text: content
            }
        };

        return await this.sendMessage(message);
    }

    /**
     * 发送推文通知
     * @param {Array} tweets - 推文列表
     * @returns {Promise<Object>} 响应结果
     */
    async sendTweetNotification(tweets) {
        if (!tweets || tweets.length === 0) {
            throw new Error('推文列表不能为空');
        }

        let content = '';
        
        if (tweets.length === 1) {
            // 单条推文通知
            const tweet = tweets[0];
            const tweetText = this.truncateText(tweet.text, 200);
            
            content = `🐦 新推文监控\n\n` +
                `用户: ${tweet.nickname}\n` +
                `内容: ${tweetText}\n` +
                `时间: ${this.formatTweetTime(tweet.createdAt)}\n` +
                `链接: ${tweet.url}`;
                
            if (tweet.metrics) {
                content += `\n互动: 👍${tweet.metrics.like_count || 0} 🔄${tweet.metrics.retweet_count || 0}`;
            }
        } else {
            // 多条推文汇总通知
            content = `🐦 新推文监控 (${tweets.length}条)\n\n`;
            
            tweets.forEach((tweet, index) => {
                const tweetText = this.truncateText(tweet.text, 100);
                content += `${index + 1}. ${tweet.nickname}\n${tweetText}\n${tweet.url}\n\n`;
            });
            
            // 添加统计信息
            const userStats = this.getTweetStats(tweets);
            content += `📊 统计信息:\n`;
            Object.entries(userStats).forEach(([user, count]) => {
                content += `${user}: ${count}条  `;
            });
        }

        return await this.sendTextMessage(content);
    }

    /**
     * 发送系统状态通知
     * @param {string} status - 状态类型 (success, warning, error)
     * @param {string} message - 状态消息
     * @param {Object} details - 详细信息
     * @returns {Promise<Object>} 响应结果
     */
    async sendSystemNotification(status, message, details = {}) {
        const statusEmojis = {
            success: '✅',
            warning: '⚠️',
            error: '❌',
            info: 'ℹ️'
        };

        const emoji = statusEmojis[status] || 'ℹ️';
        let content = `${emoji} 系统通知\n\n${message}`;

        if (Object.keys(details).length > 0) {
            content += '\n\n详细信息:';
            Object.entries(details).forEach(([key, value]) => {
                content += `\n${key}: ${value}`;
            });
        }

        return await this.sendTextMessage(content);
    }

    /**
     * 发送监控统计报告
     * @param {Object} stats - 统计数据
     * @returns {Promise<Object>} 响应结果
     */
    async sendMonitorReport(stats) {
        const content = `📊 监控统计报告\n\n` +
            `监控用户数: ${stats.totalUsers || 0}\n` +
            `总推文数: ${stats.totalTweets || 0}\n` +
            `成功次数: ${stats.successCount || 0}\n` +
            `错误次数: ${stats.errorCount || 0}\n` +
            `限流次数: ${stats.rateLimitHits || 0}\n` +
            `最后成功时间: ${stats.lastSuccessTime ? this.formatTweetTime(stats.lastSuccessTime) : '无'}`;

        return await this.sendTextMessage(content);
    }

    /**
     * 发送消息（带重试机制）
     * @param {Object} message - 消息对象
     * @returns {Promise<Object>} 响应结果
     */
    async sendMessage(message) {
        let lastError = null;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const url = `${this.baseUrl}?access_token=${this.accessToken}`;
                
                const response = await axios.post(url, message, {
                    headers: { "Content-Type": "application/json;charset=utf-8" },
                    timeout: 10000
                });

                // 检查钉钉API响应
                if (response.data && response.data.errcode === 0) {
                    return {
                        success: true,
                        data: response.data,
                        attempt: attempt
                    };
                } else {
                    throw new Error(`钉钉API错误: ${response.data?.errmsg || '未知错误'}`);
                }

            } catch (error) {
                lastError = error;
                console.warn(`钉钉通知发送失败 (尝试 ${attempt}/${this.maxRetries}):`, error.message);
                
                if (attempt < this.maxRetries) {
                    // 等待后重试
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                }
            }
        }

        // 所有重试都失败了
        throw new Error(`钉钉通知发送最终失败: ${lastError?.message || '未知错误'}`);
    }

    /**
     * 截断文本
     * @param {string} text - 原文本
     * @param {number} maxLength - 最大长度
     * @returns {string} 截断后的文本
     */
    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * 格式化推文时间
     * @param {string} createdAt - 创建时间
     * @returns {string} 格式化后的时间
     */
    formatTweetTime(createdAt) {
        try {
            const date = new Date(createdAt);
            // 使用ISO格式的UTC时间
            return date.toISOString();
        } catch {
            return createdAt;
        }
    }

    /**
     * 获取推文统计
     * @param {Array} tweets - 推文列表
     * @returns {Object} 用户推文统计
     */
    getTweetStats(tweets) {
        const stats = {};
        tweets.forEach(tweet => {
            const user = tweet.nickname || '未知用户';
            stats[user] = (stats[user] || 0) + 1;
        });
        return stats;
    }

    /**
     * 测试连接
     * @returns {Promise<boolean>} 是否连接成功
     */
    async testConnection() {
        try {
            const testMessage = {
                msgtype: "text",
                text: { content: "钉钉通知连接测试 - " + getCurrentTime() }
            };
            
            const result = await this.sendMessage(testMessage);
            return result.success;
        } catch (error) {
            console.error('钉钉连接测试失败:', error.message);
            return false;
        }
    }
}

/**
 * 发送钉钉通知消息（兼容旧接口）
 * @param {string} dingtalkAccessToken - 钉钉访问令牌
 * @param {string} content - 要发送的消息内容
 * @param {string} [keyWord='.'] - 消息关键词，默认为'.'
 * @returns {Promise<Object>} 钉钉 API 的响应结果
 * @throws {Error} 当发送消息失败时抛出错误
 */
export async function dingdingNotifier(dingtalkAccessToken, content, keyWord = '.') {
    const notifier = new DingTalkNotifier(dingtalkAccessToken);
    const result = await notifier.sendTextMessage(content, keyWord);
    return result.data;
}

export function getCurrentTime(showTimezone = true) {
    // 获取当前UTC时间
    const now = new Date();

    // 格式化UTC时间
    const timeStr = now.toISOString();

    // 根据showTimezone参数决定是否显示时区信息
    return showTimezone
        ? `${timeStr} (UTC)`
        : timeStr;
}