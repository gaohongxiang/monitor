/**
 * 监控模块注册表 - 简化版
 * 统一管理所有监控模块的注册和创建
 */

// 监控模块映射表
const MONITOR_REGISTRY = {
    'twitter': {
        name: 'twitter',
        type: 'social_media',
        description: 'Twitter用户监控',
        factory: async (sharedServices, config) => {
            const { TwitterMonitor } = await import('./twitter/TwitterMonitor.js');
            return new TwitterMonitor(sharedServices, config);
        }
    },
    
    'binance-announcement': {
        name: 'binance-announcement',
        type: 'crypto_announcement',
        description: 'Binance公告监控',
        factory: async (sharedServices, config) => {
            const { BinanceAnnouncementMonitor } = await import('./binance-announcement/BinanceAnnouncementMonitor.js');
            return new BinanceAnnouncementMonitor(sharedServices, config);
        }
    },

    'binance-price': {
        name: 'binance-price',
        type: 'price_monitor',
        description: 'Binance价格监控',
        factory: async (sharedServices, config) => {
            const { BinancePriceMonitor } = await import('./binance-price/BinancePriceMonitor.js');
            return new BinancePriceMonitor(sharedServices, config);
        }
    }
};

/**
 * 获取所有可用的监控模块
 * @returns {Array} 模块信息列表
 */
export function getAvailableMonitors() {
    return Object.values(MONITOR_REGISTRY).map(({ name, type, description }) => ({
        name, type, description
    }));
}

/**
 * 检查模块是否存在
 * @param {string} moduleName - 模块名称
 * @returns {boolean} 是否存在
 */
export function hasMonitor(moduleName) {
    return moduleName in MONITOR_REGISTRY;
}

/**
 * 创建监控模块实例
 * @param {string} moduleName - 模块名称
 * @param {Object} sharedServices - 共享服务
 * @param {Object} config - 配置
 * @returns {Promise<Object|null>} 监控器实例
 */
export async function createMonitor(moduleName, sharedServices, config) {
    const moduleInfo = MONITOR_REGISTRY[moduleName];
    
    if (!moduleInfo) {
        console.warn(`❌ 未知的监控模块: ${moduleName}`);
        return null;
    }
    
    try {
        console.log(`🔧 创建监控模块: ${moduleName}`);
        const monitor = await moduleInfo.factory(sharedServices, config);
        console.log(`✅ 监控模块 ${moduleName} 创建成功`);
        return monitor;
    } catch (error) {
        console.error(`❌ 创建监控模块 ${moduleName} 失败:`, error.message);
        return null;
    }
}

/**
 * 注册新的监控模块（用于扩展）
 * @param {string} name - 模块名称
 * @param {Object} moduleInfo - 模块信息
 */
export function registerMonitor(name, moduleInfo) {
    if (MONITOR_REGISTRY[name]) {
        console.warn(`⚠️  监控模块 ${name} 已存在，将被覆盖`);
    }
    
    MONITOR_REGISTRY[name] = {
        name,
        ...moduleInfo
    };
    
    console.log(`✅ 监控模块 ${name} 注册成功`);
}
