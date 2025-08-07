/**
 * 监控模块统一入口
 * 导出所有可用的监控器
 */

// Binance监控模块
export { BinanceWebSocketMonitor } from './binance/BinanceWebSocketMonitor.js';

// Twitter监控模块
export { TwitterMonitor } from './twitter/TwitterMonitor.js';

// 基础监控器
export { BaseMonitor } from './base/BaseMonitor.js';
export { BaseScheduler } from './base/BaseScheduler.js';

/**
 * 获取可用的监控器列表
 * @returns {Array} 监控器名称列表
 */
export function getAvailableMonitors() {
    return ['binance', 'twitter'];
}

/**
 * 根据名称创建监控器实例
 * @param {string} name - 监控器名称
 * @param {Object} sharedServices - 共享服务
 * @param {Object} config - 配置
 * @returns {Object|null} 监控器实例
 */
export async function createMonitor(name, sharedServices, config) {
    switch (name.toLowerCase()) {
        case 'binance':
            const { BinanceWebSocketMonitor } = await import('./binance/BinanceWebSocketMonitor.js');
            return new BinanceWebSocketMonitor(sharedServices, config);

        case 'twitter':
            const { TwitterMonitor } = await import('./twitter/TwitterMonitor.js');
            return new TwitterMonitor(sharedServices, config);

        default:
            console.warn(`未知的监控器类型: ${name}`);
            return null;
    }
}
