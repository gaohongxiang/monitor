/**
 * 时间工具类
 * 统一处理UTC和UTC+8时间的转换和显示
 */
export class TimeUtils {
    /**
     * 将UTC时间转换为UTC+8时间字符串
     * @param {Date} utcDate - UTC时间
     * @returns {string} UTC+8时间字符串
     */
    static toUTC8String(utcDate = new Date()) {
        const utc8Date = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
        return utc8Date.toISOString().replace('T', ' ').substring(0, 19) + ' (UTC+8)';
    }

    /**
     * 将UTC时间转换为UTC+8的HH:MM格式
     * @param {Date} utcDate - UTC时间
     * @returns {string} HH:MM格式的UTC+8时间
     */
    static toUTC8Time(utcDate = new Date()) {
        const utc8Date = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
        const hours = utc8Date.getUTCHours().toString().padStart(2, '0');
        const minutes = utc8Date.getUTCMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * 将UTC时间数组转换为UTC+8时间数组
     * @param {Array} utcTimes - UTC时间数组 ['03:30', '09:15']
     * @returns {Array} UTC+8时间数组
     */
    static convertUTCTimesToUTC8(utcTimes) {
        return utcTimes.map(timeStr => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            let utc8Hours = hours + 8;
            
            // 处理跨日情况
            if (utc8Hours >= 24) {
                utc8Hours -= 24;
            }
            
            return `${utc8Hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        });
    }

    /**
     * 计算距离下次执行的时间
     * @param {Array} scheduleTimes - 调度时间数组 [{hour: 3, minute: 30}, ...]
     * @returns {Object} 下次执行信息
     */
    static getNextExecutionInfo(scheduleTimes) {
        const now = new Date();
        const currentUTCHour = now.getUTCHours();
        const currentUTCMinute = now.getUTCMinutes();
        const currentTotalMinutes = currentUTCHour * 60 + currentUTCMinute;

        // 找到下一个执行时间
        let nextExecution = null;
        let minDiff = Infinity;

        for (const schedule of scheduleTimes) {
            const scheduleMinutes = schedule.hour * 60 + schedule.minute;
            let diff = scheduleMinutes - currentTotalMinutes;
            
            // 如果是明天的时间
            if (diff <= 0) {
                diff += 24 * 60; // 加一天
            }
            
            if (diff < minDiff) {
                minDiff = diff;
                nextExecution = {
                    utcTime: `${schedule.hour.toString().padStart(2, '0')}:${schedule.minute.toString().padStart(2, '0')}`,
                    utc8Time: this.toUTC8Time(new Date(Date.UTC(2000, 0, 1, schedule.hour, schedule.minute))),
                    minutesUntil: diff
                };
            }
        }

        return nextExecution;
    }

    /**
     * 格式化剩余时间
     * @param {number} minutes - 剩余分钟数
     * @returns {string} 格式化的剩余时间
     */
    static formatRemainingTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours > 0) {
            return `${hours}小时${mins}分钟`;
        } else {
            return `${mins}分钟`;
        }
    }

    /**
     * 获取当前UTC+8时间字符串（用于钉钉消息）
     * @returns {string} 当前UTC+8时间
     */
    static getCurrentUTC8TimeForMessage() {
        const now = new Date();
        const utc8Date = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const year = utc8Date.getUTCFullYear();
        const month = (utc8Date.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = utc8Date.getUTCDate().toString().padStart(2, '0');
        const hours = utc8Date.getUTCHours().toString().padStart(2, '0');
        const minutes = utc8Date.getUTCMinutes().toString().padStart(2, '0');
        const seconds = utc8Date.getUTCSeconds().toString().padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
}