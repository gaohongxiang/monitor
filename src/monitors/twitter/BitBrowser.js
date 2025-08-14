/**
 * BitBrowser指纹浏览器工具类
 * Twitter专用的浏览器自动化工具
 * bitbrowser api : https://doc.bitbrowser.cn/api-jie-kou-wen-dang/liu-lan-qi-jie-kou
 * playwright文档: https://playwright.dev/docs/library
 */
import playwright from 'playwright';
import axios from 'axios';

const bitbrowserUrl = 'http://127.0.0.1:54345';

/**
 * 睡眠函数
 * @param {number} seconds - 睡眠秒数
 */
const sleep = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

export class BitBrowser {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.browserId = null;
        this.isStarted = false;
    }

    /**
     * 创建并初始化BitBrowser实例
     * @static
     * @param {Object} params - 初始化参数
     * @param {string} params.browserId - BitBrowser浏览器ID
     * @returns {Promise<BitBrowser>} 初始化完成的实例
     */
    static async create({ browserId }) {
        const instance = new BitBrowser();
        instance.browserId = browserId;

        try {
            await instance.initialize();
            return instance;
        } catch (error) {
            console.error('BitBrowser初始化失败:', browserId, error);
            throw error;
        }
    }

    /**
     * 打开BitBrowser浏览器并获取连接信息
     * @private
     * @returns {Promise<{ws: string, chromeDriverPath: string, http: string}>} 浏览器连接信息
     */
    async open() {
        try {
            const response = await axios.post(`${bitbrowserUrl}/browser/open`, { id: this.browserId });
            if (response.data.success === true) {
                const { ws, driver: chromeDriverPath, http } = response.data.data;
                return { ws, chromeDriverPath, http };
            } else {
                throw new Error('BitBrowser API请求失败,请重试');
            }
        } catch (error) {
            console.error('打开BitBrowser失败:', error);
            throw error;
        }
    }

    /**
     * 初始化浏览器实例
     */
    async initialize() {
        try {
            if (this.isStarted) {
                console.log('BitBrowser已经初始化，跳过重复初始化');
                return;
            }

            console.log(`初始化BitBrowser: ${this.browserId}`);

            // 通过BitBrowser API打开浏览器
            const { ws } = await this.open();

            // 连接到BitBrowser
            this.browser = await playwright.chromium.connectOverCDP(ws);

            // 获取现有的上下文和页面
            const allContexts = this.browser.contexts();
            this.context = allContexts[0];

            const allPages = this.context.pages();
            this.page = allPages[0];

            // 关闭其他页面，只保留主页面
            for (const page of allPages) {
                if (page !== this.page) {
                    await page.close();
                }
            }

            this.isStarted = true;
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
            // 使用BitBrowser API关闭浏览器
            await axios.post(`${bitbrowserUrl}/browser/close`, { id: this.browserId });

            // 清理本地引用
            this.page = null;
            this.context = null;
            this.browser = null;
            this.isStarted = false;

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