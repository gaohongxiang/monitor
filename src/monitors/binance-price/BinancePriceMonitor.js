/**
 * Binance价格监控器
 * 支持REST API轮询和WebSocket实时监控两种模式
 * 混合使用：WebSocket实时预警 + REST API每日报告
 */
import { BaseMonitor } from '../base/BaseMonitor.js';
import WebSocket from 'ws';
import { SocksProxyAgent } from 'socks-proxy-agent';

export class BinancePriceMonitor extends BaseMonitor {
    constructor(sharedServices, config) {
        super('binance-price', sharedServices, config);

        // 解析环境变量配置
        this.parseEnvironmentConfig();

        // WebSocket相关
        this.ws = null;
        this.isConnected = false;
        this.isRunning = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.pingInterval = null;
        this.priceData = new Map(); // WebSocket实时价格数据

        // REST API相关
        this.priceCache = new Map(); // symbol -> {price, timestamp}
        this.priceCheckInterval = null;
        this.dailyReportInterval = null;
        this.lastDailyReport = null;

        // 共享状态
        this.lastAlerts = new Map(); // symbol -> timestamp

        // 配置代理
        this.agent = null;
        if (this.proxyUrl) {
            console.log(`🌐 配置代理: ${this.proxyUrl}`);
            this.agent = new SocksProxyAgent(this.proxyUrl);
        }

        this.logConfiguration();
    }

    /**
     * 解析环境变量配置
     */
    parseEnvironmentConfig() {
        // 解析交易对和阈值配置
        const symbolsConfig = process.env.BINANCE_PRICE_SYMBOLS || 'BTCUSDT:3,ETHUSDT:4,BNBUSDT:6';
        this.symbols = [];
        this.symbolThresholds = {};

        symbolsConfig.split(',').forEach(item => {
            const [symbol, threshold] = item.trim().split(':');
            if (symbol) {
                this.symbols.push(symbol);
                if (threshold) {
                    this.symbolThresholds[symbol] = parseFloat(threshold);
                }
            }
        });

        // 其他配置
        this.cooldownPeriod = parseInt(process.env.BINANCE_PRICE_COOLDOWN) || 3600;
        this.dailyReportTime = process.env.BINANCE_PRICE_DAILY_TIME || '09:00';
        this.proxyUrl = process.env.BINANCE_PROXY_URL;

        // 默认阈值（如果某个交易对没有单独设置）
        this.defaultThreshold = 5.0;
    }

    /**
     * 打印配置信息
     */
    logConfiguration() {
        console.log('📊 Binance价格监控器配置:');
        console.log(`   监控交易对: ${this.symbols.join(', ')}`);
        console.log(`   冷却期: ${this.cooldownPeriod}秒`);
        console.log(`   每日报告时间: ${this.dailyReportTime}`);

        console.log('   预警阈值配置:');
        for (const symbol of this.symbols) {
            const threshold = this.getThresholdForSymbol(symbol);
            console.log(`     ${symbol}: ${threshold}%`);
        }
    }

    /**
     * 获取指定交易对的预警阈值
     */
    getThresholdForSymbol(symbol) {
        return this.symbolThresholds[symbol] || this.defaultThreshold;
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
     */
    async onStart() {
        try {
            console.log(`🚀 启动Binance价格监控器...`);
            this.isRunning = true;

            // 启动WebSocket实时监控
            console.log('📈 启动WebSocket实时价格监控...');
            await this.connectWebSocket();

            // 启动REST API定期检查和每日报告
            console.log('📊 启动REST API定期检查和每日报告...');
            await this.startRestApiMonitoring();

            console.log(`✅ Binance价格监控启动成功`);
            return true;

        } catch (error) {
            console.error('❌ Binance价格监控启动失败:', error.message);
            return false;
        }
    }

    /**
     * 停止监控
     */
    async onStop() {
        try {
            console.log('⏹️  停止Binance价格监控器...');
            this.isRunning = false;

            // 停止WebSocket连接
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(1000, 'Monitor stopped');
            }

            // 清理定时器
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }

            if (this.priceCheckInterval) {
                clearInterval(this.priceCheckInterval);
                this.priceCheckInterval = null;
            }

            if (this.dailyReportInterval) {
                clearInterval(this.dailyReportInterval);
                this.dailyReportInterval = null;
            }

            this.isConnected = false;
            console.log('✅ Binance价格监控器已停止');
            return true;

        } catch (error) {
            console.error('❌ Binance价格监控器停止失败:', error.message);
            return false;
        }
    }

    // ==================== WebSocket实时监控 ====================

    /**
     * 建立WebSocket连接
     */
    async connectWebSocket() {
        try {
            console.log('🔗 建立WebSocket连接...');

            // 构建订阅流名称
            const streams = this.symbols.map(symbol =>
                `${symbol.toLowerCase()}@ticker`
            ).join('/');

            const wsUrl = `wss://stream.binance.com:9443/ws/${streams}`;
            console.log(`🌐 WebSocket连接URL: ${wsUrl}`);

            const wsOptions = {};
            if (this.agent) {
                wsOptions.agent = this.agent;
                console.log('🌐 使用代理连接WebSocket');
            }

            this.ws = new WebSocket(wsUrl, [], wsOptions);
            this.setupWebSocketEventHandlers();

        } catch (error) {
            console.error('❌ 建立WebSocket连接失败:', error.message);
            if (this.isRunning) {
                this.scheduleWebSocketReconnect();
            }
        }
    }

    /**
     * 设置WebSocket事件处理器
     */
    setupWebSocketEventHandlers() {
        this.ws.on('open', () => {
            console.log('✅ WebSocket连接已建立');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.startWebSocketHeartbeat();
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.error('❌ 处理WebSocket消息失败:', error.message);
            }
        });

        this.ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket连接已关闭: ${code} - ${reason}`);
            this.isConnected = false;

            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }

            if (this.isRunning && this.useWebSocket) {
                this.scheduleWebSocketReconnect();
            }
        });

        this.ws.on('error', (error) => {
            console.error('❌ WebSocket错误:', error.message);
        });

        this.ws.on('pong', () => {
            console.log('🏓 收到PONG响应');
        });
    }

    /**
     * 处理WebSocket消息
     */
    async handleWebSocketMessage(message) {
        try {
            // 处理单个ticker消息
            if (message.e === '24hrTicker') {
                await this.processWebSocketTicker(message);
                return;
            }

            // 处理多个ticker消息（数组格式）
            if (Array.isArray(message)) {
                for (const ticker of message) {
                    if (ticker.e === '24hrTicker') {
                        await this.processWebSocketTicker(ticker);
                    }
                }
                return;
            }

        } catch (error) {
            console.error('❌ 处理WebSocket ticker消息失败:', error.message);
        }
    }

    /**
     * 处理WebSocket ticker数据
     */
    async processWebSocketTicker(ticker) {
        const symbol = ticker.s; // 交易对符号
        const priceChangePercent = parseFloat(ticker.P); // 24小时价格变化百分比
        const lastPrice = parseFloat(ticker.c); // 最新价格
        const openPrice = parseFloat(ticker.o); // 24小时前开盘价
        const highPrice = parseFloat(ticker.h); // 24小时最高价
        const lowPrice = parseFloat(ticker.l); // 24小时最低价
        const volume = parseFloat(ticker.v); // 24小时成交量

        // 简化日志输出
        const changeIcon = priceChangePercent >= 0 ? '📈' : '📉';
        const changeStr = priceChangePercent >= 0 ? `+${priceChangePercent.toFixed(2)}` : priceChangePercent.toFixed(2);
        console.log(`${changeIcon} ${symbol}: $${lastPrice.toFixed(8)} (${changeStr}%)`);

        // 更新价格数据缓存
        this.priceData.set(symbol, {
            symbol,
            lastPrice,
            priceChangePercent,
            openPrice,
            highPrice,
            lowPrice,
            volume,
            timestamp: Date.now()
        });

        // 检查是否需要发送预警
        await this.checkWebSocketPriceAlert(symbol, priceChangePercent, lastPrice);
    }

    /**
     * 检查WebSocket价格预警
     */
    async checkWebSocketPriceAlert(symbol, changePercent, currentPrice) {
        try {
            const threshold = this.getThresholdForSymbol(symbol);

            // 检查是否超过阈值
            if (Math.abs(changePercent) >= threshold) {
                // 检查冷却期
                const lastAlert = this.lastAlerts.get(symbol);
                const now = Date.now();

                if (!lastAlert || (now - lastAlert) >= this.cooldownPeriod * 1000) {
                    await this.sendWebSocketPriceAlert(symbol, changePercent, currentPrice, threshold);
                    this.lastAlerts.set(symbol, now);
                }
            }
        } catch (error) {
            console.error(`❌ 检查WebSocket价格预警失败 [${symbol}]:`, error.message);
        }
    }

    /**
     * 发送WebSocket价格预警
     */
    async sendWebSocketPriceAlert(symbol, changePercent, currentPrice, threshold) {
        try {
            const direction = changePercent > 0 ? '上涨' : '下跌';
            const icon = changePercent > 0 ? '📈' : '📉';
            const changeStr = changePercent > 0 ? `+${changePercent.toFixed(2)}` : changePercent.toFixed(2);

            // 简化币种名称显示（BTCUSDT -> BTC）
            const simplifiedSymbol = symbol.replace('USDT', '').replace('BTC', 'BTC').replace('ETH', 'ETH').replace('BNB', 'BNB');

            // 格式化价格显示（添加千分位分隔符）
            const formattedPrice = this.formatPrice(currentPrice);

            // 获取额外的价格信息
            const priceInfo = this.priceData.get(symbol);
            let additionalInfo = '';
            if (priceInfo) {
                additionalInfo = `\n📊 24h最高: $${this.formatPrice(priceInfo.highPrice)}` +
                               `\n📊 24h最低: $${this.formatPrice(priceInfo.lowPrice)}` +
                               `\n💹 24h成交量: ${this.formatVolume(priceInfo.volume)}`;
            }

            const message = `💰 ${simplifiedSymbol}: $${formattedPrice} (${changeStr}%)

⚡ 价格预警 | 触发${threshold}%阈值 | ${new Date().toLocaleString('zh-CN').split(' ')[1]}

📊 24小时数据:${additionalInfo}`;

            await this.sendNotification(message, 'websocket_price_alert');
            console.log(`📢 实时价格预警已发送: ${symbol} ${direction} ${Math.abs(changePercent).toFixed(2)}%`);

        } catch (error) {
            console.error(`❌ 发送WebSocket价格预警失败 [${symbol}]:`, error.message);
        }
    }

    /**
     * 启动WebSocket心跳机制
     */
    startWebSocketHeartbeat() {
        console.log('💓 启动WebSocket心跳机制 (每30秒)');
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
                console.log('🏓 发送WebSocket PING心跳');
            }
        }, 30000);
    }

    /**
     * 安排WebSocket重连
     */
    scheduleWebSocketReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`❌ WebSocket重连失败，已达到最大重连次数: ${this.maxReconnectAttempts}`);
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

        console.log(`🔄 安排WebSocket重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts}) 在 ${delay}ms 后...`);

        setTimeout(() => {
            if (this.isRunning && this.useWebSocket) {
                this.connectWebSocket();
            }
        }, delay);
    }

    // ==================== REST API定期监控 ====================

    /**
     * 启动REST API监控
     */
    async startRestApiMonitoring() {
        try {
            // 初始化价格缓存
            await this.initializePriceCache();

            // 启动每日报告检查（每分钟检查一次是否到了报告时间）
            this.dailyReportInterval = setInterval(async () => {
                await this.checkDailyReport();
            }, 60 * 1000);

            console.log(`📅 每日报告时间: ${this.dailyReportTime}`);

        } catch (error) {
            console.error('❌ 启动REST API监控失败:', error.message);
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
     */
    async fetchCurrentPrices() {
        try {
            const symbolsParam = this.symbols.map(s => `"${s}"`).join(',');
            const fetchOptions = {};
            if (this.agent) {
                fetchOptions.agent = this.agent;
            }

            const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${symbolsParam}]`, fetchOptions);

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

            // 简化版本：不记录到数据库，只发送通知

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
     * 检查是否需要发送每日报告
     */
    async checkDailyReport() {
        try {
            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const today = now.toDateString();

            // 检查是否到了每日报告时间
            if (currentTime === this.dailyReportTime) {
                // 检查今天是否已经发送过报告
                if (this.lastDailyReport !== today) {
                    await this.sendDailyPriceReport();
                    this.lastDailyReport = today;
                }
            }
        } catch (error) {
            console.error('❌ 检查每日报告失败:', error.message);
        }
    }

    /**
     * 发送每日价格报告
     */
    async sendDailyPriceReport() {
        try {
            console.log('📊 生成每日价格报告...');

            const stats24h = await this.fetch24hStats();

            let reportMessage = '📊 每日价格报告\n';
            reportMessage += `📅 ${new Date().toLocaleDateString('zh-CN')}\n\n`;

            for (const symbol of this.symbols) {
                const stats = stats24h[symbol];
                if (stats) {
                    const change24h = parseFloat(stats.priceChangePercent);
                    const changeIcon = change24h >= 0 ? '📈' : '📉';
                    const changeStr = change24h >= 0 ? `+${change24h.toFixed(2)}` : change24h.toFixed(2);

                    const symbolThreshold = this.getThresholdForSymbol(symbol);

                    reportMessage += `${changeIcon} ${symbol}\n`;
                    reportMessage += `💰 当前价格: $${parseFloat(stats.lastPrice).toFixed(8)}\n`;
                    reportMessage += `📊 24h变化: ${changeStr}%\n`;
                    reportMessage += `📈 24h最高: $${parseFloat(stats.highPrice).toFixed(8)}\n`;
                    reportMessage += `📉 24h最低: $${parseFloat(stats.lowPrice).toFixed(8)}\n`;
                    reportMessage += `💹 24h成交量: ${this.formatVolume(parseFloat(stats.volume))}\n`;
                    reportMessage += `⚠️  预警阈值: ${symbolThreshold}%\n\n`;
                }
            }

            reportMessage += `💡 提示: 各交易对价格变化超过对应阈值时会自动发送预警`;

            await this.sendNotification(reportMessage, 'daily_report');

            console.log('✅ 每日价格报告发送成功');

        } catch (error) {
            console.error('❌ 发送每日价格报告失败:', error.message);
        }
    }



    /**
     * 获取24小时价格统计
     */
    async fetch24hStats() {
        try {
            const symbolsParam = this.symbols.map(s => `"${s}"`).join(',');
            const fetchOptions = {};
            if (this.agent) {
                fetchOptions.agent = this.agent;
            }

            const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbolsParam}]`, fetchOptions);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const stats = {};

            data.forEach(item => {
                stats[item.symbol] = item;
            });

            return stats;

        } catch (error) {
            console.error('❌ 获取24小时统计数据失败:', error.message);
            throw error;
        }
    }

    /**
     * 格式化价格显示（添加千分位分隔符）
     */
    formatPrice(price) {
        const num = parseFloat(price);
        if (num >= 1) {
            return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            return num.toFixed(8);
        }
    }

    /**
     * 格式化成交量
     */
    formatVolume(volume) {
        if (volume >= 1e9) {
            return (volume / 1e9).toFixed(2) + 'B';
        } else if (volume >= 1e6) {
            return (volume / 1e6).toFixed(2) + 'M';
        } else if (volume >= 1e3) {
            return (volume / 1e3).toFixed(2) + 'K';
        } else {
            return volume.toFixed(2);
        }
    }

    // ==================== 状态和工具方法 ====================

    /**
     * 获取当前价格数据
     */
    getCurrentPriceData() {
        const result = {};

        // 优先使用WebSocket数据
        if (this.useWebSocket && this.priceData.size > 0) {
            for (const [symbol, data] of this.priceData.entries()) {
                result[symbol] = {
                    source: 'websocket',
                    lastPrice: data.lastPrice,
                    priceChangePercent: data.priceChangePercent,
                    highPrice: data.highPrice,
                    lowPrice: data.lowPrice,
                    volume: data.volume,
                    timestamp: data.timestamp
                };
            }
        }

        // 补充REST API数据
        if (this.useRestApi && this.priceCache.size > 0) {
            for (const [symbol, data] of this.priceCache.entries()) {
                if (!result[symbol]) {
                    result[symbol] = {
                        source: 'rest_api',
                        lastPrice: data.price,
                        timestamp: data.timestamp
                    };
                }
            }
        }

        return result;
    }

    /**
     * 获取监控状态
     */
    getStatus() {
        return {
            ...super.getStatus(),
            // 基础配置
            symbols: this.symbols,
            symbolThresholds: this.symbolThresholds,
            defaultThreshold: this.defaultThreshold,
            checkInterval: this.checkInterval,
            cooldownPeriod: this.cooldownPeriod,
            dailyReportTime: this.dailyReportTime,

            // WebSocket状态
            websocket: {
                isConnected: this.isConnected,
                reconnectAttempts: this.reconnectAttempts,
                priceDataCount: this.priceData.size
            },

            // REST API状态
            restApi: {
                isDailyReportActive: !!this.dailyReportInterval,
                priceCacheCount: this.priceCache.size
            },

            // 当前价格数据
            currentPrices: this.getCurrentPriceData(),

            // 预警状态
            lastAlerts: Object.fromEntries(this.lastAlerts)
        };
    }
}
