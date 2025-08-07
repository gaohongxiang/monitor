/**
 * 时间工具函数
 * 提供时间相关的实用功能
 */

/**
 * 检查当前时间是否在指定的时间范围内
 * @param {string} startTime - 开始时间 (HH:MM 格式)
 * @param {string} endTime - 结束时间 (HH:MM 格式)
 * @param {string} timezone - 时区 (默认为 'Asia/Shanghai')
 * @returns {boolean} 是否在时间范围内
 */
export function isWithinTimeRange(startTime, endTime, timezone = 'Asia/Shanghai') {
    try {
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-US', {
            timeZone: timezone,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });

        // 将时间字符串转换为分钟数进行比较
        const timeToMinutes = (timeStr) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const currentMinutes = timeToMinutes(currentTime);
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);

        // 处理跨天的情况
        if (startMinutes <= endMinutes) {
            // 同一天内的时间范围
            return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        } else {
            // 跨天的时间范围
            return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
        }
    } catch (error) {
        console.error('检查时间范围时出错:', error);
        return false;
    }
}

/**
 * 获取当前UTC+8时间的字符串表示
 * @param {string} format - 时间格式 ('time' | 'datetime' | 'date')
 * @returns {string} 格式化的时间字符串
 */
export function getCurrentTimeUTC8(format = 'datetime') {
    const now = new Date();
    const options = {
        timeZone: 'Asia/Shanghai',
        hour12: false
    };

    switch (format) {
        case 'time':
            return now.toLocaleTimeString('zh-CN', {
                ...options,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        case 'date':
            return now.toLocaleDateString('zh-CN', {
                ...options,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        case 'datetime':
        default:
            return now.toLocaleString('zh-CN', {
                ...options,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
    }
}

/**
 * 计算两个时间之间的差值（分钟）
 * @param {string} startTime - 开始时间 (HH:MM 格式)
 * @param {string} endTime - 结束时间 (HH:MM 格式)
 * @returns {number} 时间差值（分钟）
 */
export function getTimeDifferenceInMinutes(startTime, endTime) {
    try {
        const timeToMinutes = (timeStr) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);

        if (endMinutes >= startMinutes) {
            return endMinutes - startMinutes;
        } else {
            // 跨天的情况
            return (24 * 60 - startMinutes) + endMinutes;
        }
    } catch (error) {
        console.error('计算时间差值时出错:', error);
        return 0;
    }
}

/**
 * 延迟执行函数
 * @param {number} seconds - 延迟秒数
 * @returns {Promise} Promise对象
 */
export function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * 延迟执行函数（毫秒）
 * @param {number} milliseconds - 延迟毫秒数
 * @returns {Promise} Promise对象
 */
export function sleepMs(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * 格式化时间戳为可读字符串
 * @param {number|Date} timestamp - 时间戳或Date对象
 * @param {string} timezone - 时区 (默认为 'Asia/Shanghai')
 * @returns {string} 格式化的时间字符串
 */
export function formatTimestamp(timestamp, timezone = 'Asia/Shanghai') {
    try {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch (error) {
        console.error('格式化时间戳时出错:', error);
        return '无效时间';
    }
}

/**
 * 获取下一个指定时间的时间戳
 * @param {string} targetTime - 目标时间 (HH:MM 格式)
 * @param {string} timezone - 时区 (默认为 'Asia/Shanghai')
 * @returns {Date} 下一个目标时间的Date对象
 */
export function getNextTargetTime(targetTime, timezone = 'Asia/Shanghai') {
    try {
        const [hours, minutes] = targetTime.split(':').map(Number);
        const now = new Date();
        
        // 创建今天的目标时间
        const today = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        today.setHours(hours, minutes, 0, 0);
        
        // 如果目标时间已过，则设置为明天
        if (today <= now) {
            today.setDate(today.getDate() + 1);
        }
        
        return today;
    } catch (error) {
        console.error('获取下一个目标时间时出错:', error);
        return new Date();
    }
}

/**
 * 检查是否为工作日
 * @param {Date} date - 要检查的日期（可选，默认为当前日期）
 * @returns {boolean} 是否为工作日
 */
export function isWeekday(date = new Date()) {
    const day = date.getDay();
    return day >= 1 && day <= 5; // 周一到周五
}

/**
 * 检查是否为周末
 * @param {Date} date - 要检查的日期（可选，默认为当前日期）
 * @returns {boolean} 是否为周末
 */
export function isWeekend(date = new Date()) {
    const day = date.getDay();
    return day === 0 || day === 6; // 周日或周六
}

/**
 * 获取时间范围的描述
 * @param {string} startTime - 开始时间
 * @param {string} endTime - 结束时间
 * @returns {string} 时间范围描述
 */
export function getTimeRangeDescription(startTime, endTime) {
    const duration = getTimeDifferenceInMinutes(startTime, endTime);
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    
    let description = `${startTime} - ${endTime}`;
    if (hours > 0) {
        description += ` (${hours}小时`;
        if (minutes > 0) {
            description += `${minutes}分钟`;
        }
        description += ')';
    } else if (minutes > 0) {
        description += ` (${minutes}分钟)`;
    }
    
    return description;
}

/**
 * 创建定时器，在指定时间执行回调
 * @param {string} targetTime - 目标时间 (HH:MM 格式)
 * @param {Function} callback - 回调函数
 * @param {string} timezone - 时区 (默认为 'Asia/Shanghai')
 * @returns {NodeJS.Timeout} 定时器ID
 */
export function scheduleAtTime(targetTime, callback, timezone = 'Asia/Shanghai') {
    try {
        const nextTime = getNextTargetTime(targetTime, timezone);
        const delay = nextTime.getTime() - Date.now();
        
        console.log(`定时任务已设置，将在 ${formatTimestamp(nextTime)} 执行`);
        
        return setTimeout(() => {
            try {
                callback();
            } catch (error) {
                console.error('定时任务执行失败:', error);
            }
        }, delay);
    } catch (error) {
        console.error('设置定时任务时出错:', error);
        return null;
    }
}