/**
 * Binance价格监控器
 * 监控价格变化并发送预警
 */
import { BaseMonitor } from '../base/BaseMonitor.js';

export class BinancePriceMonitor extends BaseMonitor {
    constructor(sharedServices, config) {
        super('binance-price', sharedServices, config);
        
        this.symbols = config.symbols || ['BTCUSDT', 'ETHUSDT'];
        this.alertThreshold = config.alertThreshold || 5.0; // 5%变化预警
        this.checkInterval = config.checkInterval || 60; // 60秒检查一次
        this.cooldownPeriod = config.cooldownPeriod || 3600; // 1小时冷却期
        
        this.priceCache = new Map();
        this.lastAlerts = new Map();
        this.monitorInterval = null;
    }

    /**
     * 验证配置
     * @returns {boolean} 配置是否有效
     */
    validateConfig() {
        if (!this.config.enabled) {
            this.logger.warn('Binance价格监控未启用');
            return false;
        }

        if (!Array.isArray(this.symbols) || this.symbols.length === 0) {
            this.logger.error('未配置监控的交易对');
            return false;
        }

        return true;
    }

    /**
     * 启动监控
     * @returns {Promise<boolean>} 是否启动成功
     */
    async startMonitoring() {
        try {
            console.log(`📈 启动Binance价格监控，监控交易对: ${this.symbols.join(', ')}`);
            
            // 初始化价格缓存
            await this.initializePriceCache();
            
            // 启动定期检查
            this.monitorInterval = setInterval(async () => {
                await this.checkPriceChanges();
            }, this.checkInterval * 1000);

            console.log(`✅ Binance价格监控启动成功，检查间隔: ${this.checkInterval}秒`);
            return true;

        } catch (error) {
            console.error('❌ Binance价格监控启动失败:', error.message);
            return false;
        }
    }

    /**
     * 停止监控
     * @returns {Promise<boolean>} 是否停止成功
     */
    async stopMonitoring() {
        try {
            if (this.monitorInterval) {
                clearInterval(this.monitorInterval);
                this.monitorInterval = null;
            }

            console.log('✅ Binance价格监控已停止');
            return true;

        } catch (error) {
            console.error('❌ Binance价格监控停止失败:', error.message);
            return false;
        }
    }

    /**
     * 初始化价格缓存
     */
    async initializePriceCache() {
        try {
            const prices = await this.fetchCurrentPrices();
            for (const [symbol, price] of Object.entries(prices)) {
                this.priceCache.set(symbol, {
                    price: parseFloat(price),
                    timestamp: Date.now()
                });
            }
            console.log(`📊 初始化价格缓存完成，${Object.keys(prices).length}个交易对`);
        } catch (error) {
            console.error('❌ 初始化价格缓存失败:', error.message);
        }
    }

    /**
     * 获取当前价格
     * @returns {Promise<Object>} 价格数据
     */
    async fetchCurrentPrices() {
        try {
            const symbolsParam = this.symbols.map(s => `"${s}"`).join(',');
            const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${symbolsParam}]`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const prices = {};
            
            data.forEach(item => {
                prices[item.symbol] = item.price;
            });

            return prices;

        } catch (error) {
            console.error('❌ 获取价格数据失败:', error.message);
            throw error;
        }
    }

    /**
     * 检查价格变化
     */
    async checkPriceChanges() {
        try {
            const currentPrices = await this.fetchCurrentPrices();
            const now = Date.now();

            for (const [symbol, currentPriceStr] of Object.entries(currentPrices)) {
                const currentPrice = parseFloat(currentPriceStr);
                const cachedData = this.priceCache.get(symbol);

                if (cachedData) {
                    const changePercent = ((currentPrice - cachedData.price) / cachedData.price) * 100;
                    
                    // 检查是否需要发送预警
                    if (Math.abs(changePercent) >= this.alertThreshold) {
                        await this.handlePriceAlert(symbol, cachedData.price, currentPrice, changePercent);
                    }
                }

                // 更新缓存
                this.priceCache.set(symbol, {
                    price: currentPrice,
                    timestamp: now
                });

                // 记录价格历史
                await this.recordPriceHistory(symbol, currentPrice);
            }

        } catch (error) {
            console.error('❌ 检查价格变化失败:', error.message);
        }
    }

    /**
     * 处理价格预警
     * @param {string} symbol - 交易对
     * @param {number} oldPrice - 旧价格
     * @param {number} newPrice - 新价格
     * @param {number} changePercent - 变化百分比
     */
    async handlePriceAlert(symbol, oldPrice, newPrice, changePercent) {
        try {
            // 检查冷却期
            const lastAlert = this.lastAlerts.get(symbol);
            const now = Date.now();
            
            if (lastAlert && (now - lastAlert) < this.cooldownPeriod * 1000) {
                return; // 还在冷却期内
            }

            // 记录预警到数据库
            await this.recordPriceAlert(symbol, newPrice, changePercent);

            // 发送通知
            const direction = changePercent > 0 ? '上涨' : '下跌';
            const message = `🚨 价格预警\n` +
                          `交易对: ${symbol}\n` +
                          `${direction}: ${Math.abs(changePercent).toFixed(2)}%\n` +
                          `价格: ${oldPrice} → ${newPrice}`;

            await this.sendNotification(message, 'price_alert');

            // 更新最后预警时间
            this.lastAlerts.set(symbol, now);

            console.log(`🚨 发送价格预警: ${symbol} ${direction} ${Math.abs(changePercent).toFixed(2)}%`);

        } catch (error) {
            console.error('❌ 处理价格预警失败:', error.message);
        }
    }

    /**
     * 记录价格预警到数据库
     * @param {string} symbol - 交易对
     * @param {number} price - 当前价格
     * @param {number} changePercent - 变化百分比
     */
    async recordPriceAlert(symbol, price, changePercent) {
        const database = this.getDatabase();
        if (!database) return;

        try {
            await database.pool.query(`
                INSERT INTO price_alerts (symbol, alert_type, threshold_value, current_price, change_percent)
                VALUES ($1, $2, $3, $4, $5)
            `, [symbol, 'price_change', this.alertThreshold, price, changePercent]);

        } catch (error) {
            console.error('❌ 记录价格预警失败:', error.message);
        }
    }

    /**
     * 记录价格历史
     * @param {string} symbol - 交易对
     * @param {number} price - 价格
     */
    async recordPriceHistory(symbol, price) {
        const database = this.getDatabase();
        if (!database) return;

        try {
            // 每5分钟记录一次历史数据
            const lastRecord = await database.pool.query(`
                SELECT recorded_at FROM price_history 
                WHERE symbol = $1 
                ORDER BY recorded_at DESC 
                LIMIT 1
            `, [symbol]);

            const shouldRecord = !lastRecord.rows.length || 
                               (Date.now() - new Date(lastRecord.rows[0].recorded_at).getTime()) > 5 * 60 * 1000;

            if (shouldRecord) {
                await database.pool.query(`
                    INSERT INTO price_history (symbol, price)
                    VALUES ($1, $2)
                `, [symbol, price]);
            }

        } catch (error) {
            console.error('❌ 记录价格历史失败:', error.message);
        }
    }

    /**
     * 获取监控状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            ...super.getStatus(),
            symbols: this.symbols,
            alertThreshold: this.alertThreshold,
            checkInterval: this.checkInterval,
            priceCache: Object.fromEntries(this.priceCache),
            isMonitoring: !!this.monitorInterval
        };
    }
}
