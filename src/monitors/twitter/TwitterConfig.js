/**
 * Twitter监控模块配置
 * 处理Twitter特定的配置逻辑
 */
export class TwitterConfig {
    constructor(config) {
        this.config = config;
    }

    /**
     * 验证Twitter配置
     * @returns {boolean} 配置是否有效
     */
    validate() {
        if (!this.config.apiCredentials || this.config.apiCredentials.length === 0) {
            console.error('Twitter模块缺少API凭证配置');
            return false;
        }

        // 验证每个凭证的必需字段
        for (const credential of this.config.apiCredentials) {
            const requiredFields = ['xClientId', 'xClientSecret', 'xRedirectUri', 'xUserName', 'monitorUser'];
            for (const field of requiredFields) {
                if (!credential[field]) {
                    console.error(`Twitter凭证缺少必需字段: ${field}`);
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * 获取监控设置
     * @returns {Object} 监控设置
     */
    getMonitorSettings() {
        return this.config.monitorSettings || {
            startTimeUTC8: "09:00",
            endTimeUTC8: "23:00",
            startTime: "01:00",
            endTime: "15:00",
            testMode: false,
            testIntervalMinutes: 1,
            dailyRequestsPerApi: 3
        };
    }

    /**
     * 获取API凭证列表
     * @returns {Array} API凭证列表
     */
    getApiCredentials() {
        return this.config.apiCredentials || [];
    }

    /**
     * 是否启用测试模式
     * @returns {boolean} 是否测试模式
     */
    isTestMode() {
        return this.config.monitorSettings?.testMode || false;
    }

    /**
     * 获取测试间隔（分钟）
     * @returns {number} 测试间隔
     */
    getTestInterval() {
        return this.config.monitorSettings?.testIntervalMinutes || 1;
    }

    /**
     * 获取每日每个API的请求次数
     * @returns {number} 请求次数
     */
    getDailyRequestsPerApi() {
        return this.config.monitorSettings?.dailyRequestsPerApi || 3;
    }
}