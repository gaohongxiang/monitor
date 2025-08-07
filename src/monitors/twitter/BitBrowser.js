/**
 * BitBrowser指纹浏览器工具类
 * Twitter专用的浏览器自动化工具
 */
import { chromium } from 'playwright';

export class BitBrowser {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.browserId = null;
    }

    /**
     * 创建并初始化BitBrowser实例
     * @static
     * @param {Object} params - 初始化参数
     * @param {string} params.browserId - 指纹浏览器ID
     * @returns {Promise<BitBrowser>} 初始化完成的实例
     */
    static async create({ browserId }) {
        const instance = new BitBrowser();
        instance.browserId = browserId;
        
        try {
            await instance.initialize();
            return instance;
        } catch (error) {
            console.error('BitBrowser初始化失败:', error);
            throw error;
        }
    }

    /**
     * 初始化浏览器实例
     */
    async initialize() {
        try {
            console.log(`初始化BitBrowser: ${this.browserId}`);

            // 启动浏览器
            this.browser = await chromium.launch({
                headless: false, // 显示浏览器窗口，便于调试
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });

            // 创建浏览器上下文
            this.context = await this.browser.newContext({
                viewport: { width: 1366, height: 768 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            });

            // 创建页面
            this.page = await this.context.newPage();

            console.log(`✅ BitBrowser初始化成功: ${this.browserId}`);

        } catch (error) {
            console.error(`❌ BitBrowser初始化失败: ${this.browserId}`, error);
            throw error;
        }
    }

    /**
     * 导航到指定URL
     * @param {string} url - 目标URL
     * @param {Object} options - 导航选项
     */
    async goto(url, options = {}) {
        if (!this.page) {
            throw new Error('BitBrowser未初始化');
        }

        try {
            console.log(`导航到: ${url}`);
            await this.page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 30000,
                ...options
            });
        } catch (error) {
            console.error(`导航失败: ${url}`, error);
            throw error;
        }
    }

    /**
     * 等待指定时间
     * @param {number} ms - 等待毫秒数
     */
    async wait(ms) {
        console.log(`等待 ${ms}ms`);
        await this.page.waitForTimeout(ms);
    }

    /**
     * 点击元素
     * @param {string} selector - 元素选择器
     * @param {Object} options - 点击选项
     */
    async click(selector, options = {}) {
        if (!this.page) {
            throw new Error('BitBrowser未初始化');
        }

        try {
            console.log(`点击元素: ${selector}`);
            await this.page.click(selector, {
                timeout: 10000,
                ...options
            });
        } catch (error) {
            console.error(`点击失败: ${selector}`, error);
            throw error;
        }
    }

    /**
     * 输入文本
     * @param {string} selector - 元素选择器
     * @param {string} text - 输入文本
     * @param {Object} options - 输入选项
     */
    async type(selector, text, options = {}) {
        if (!this.page) {
            throw new Error('BitBrowser未初始化');
        }

        try {
            console.log(`输入文本到: ${selector}`);
            await this.page.fill(selector, text, {
                timeout: 10000,
                ...options
            });
        } catch (error) {
            console.error(`输入失败: ${selector}`, error);
            throw error;
        }
    }

    /**
     * 等待元素出现
     * @param {string} selector - 元素选择器
     * @param {Object} options - 等待选项
     */
    async waitForSelector(selector, options = {}) {
        if (!this.page) {
            throw new Error('BitBrowser未初始化');
        }

        try {
            console.log(`等待元素: ${selector}`);
            await this.page.waitForSelector(selector, {
                timeout: 10000,
                ...options
            });
        } catch (error) {
            console.error(`等待元素失败: ${selector}`, error);
            throw error;
        }
    }

    /**
     * 等待URL变化
     * @param {string|Function} urlOrPredicate - URL字符串或判断函数
     * @param {Object} options - 等待选项
     */
    async waitForURL(urlOrPredicate, options = {}) {
        if (!this.page) {
            throw new Error('BitBrowser未初始化');
        }

        try {
            console.log(`等待URL变化`);
            await this.page.waitForURL(urlOrPredicate, {
                timeout: 30000,
                ...options
            });
        } catch (error) {
            console.error(`等待URL变化失败`, error);
            throw error;
        }
    }

    /**
     * 获取当前URL
     * @returns {string} 当前URL
     */
    getCurrentURL() {
        if (!this.page) {
            throw new Error('BitBrowser未初始化');
        }
        return this.page.url();
    }

    /**
     * 截图
     * @param {Object} options - 截图选项
     * @returns {Buffer} 截图数据
     */
    async screenshot(options = {}) {
        if (!this.page) {
            throw new Error('BitBrowser未初始化');
        }

        try {
            console.log('截图');
            return await this.page.screenshot({
                fullPage: true,
                ...options
            });
        } catch (error) {
            console.error('截图失败', error);
            throw error;
        }
    }

    /**
     * 执行JavaScript代码
     * @param {string|Function} script - JavaScript代码或函数
     * @param {...any} args - 函数参数
     * @returns {any} 执行结果
     */
    async evaluate(script, ...args) {
        if (!this.page) {
            throw new Error('BitBrowser未初始化');
        }

        try {
            return await this.page.evaluate(script, ...args);
        } catch (error) {
            console.error('执行JavaScript失败', error);
            throw error;
        }
    }

    /**
     * 关闭浏览器
     */
    async close() {
        try {
            if (this.page) {
                await this.page.close();
                this.page = null;
            }

            if (this.context) {
                await this.context.close();
                this.context = null;
            }

            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }

            console.log(`✅ BitBrowser已关闭: ${this.browserId}`);

        } catch (error) {
            console.error(`❌ 关闭BitBrowser失败: ${this.browserId}`, error);
        }
    }

    /**
     * 检查浏览器是否正在运行
     * @returns {boolean} 是否正在运行
     */
    isRunning() {
        return !!(this.browser && this.context && this.page);
    }

    /**
     * 获取浏览器信息
     * @returns {Object} 浏览器信息
     */
    getInfo() {
        return {
            browserId: this.browserId,
            isRunning: this.isRunning(),
            currentURL: this.page ? this.page.url() : null,
            hasContext: !!this.context,
            hasPage: !!this.page
        };
    }
}