/**
 * 统一日志管理器
 * 支持多监控源的日志记录和管理
 */
import fs from 'fs';
import path from 'path';

export class UnifiedLoggerManager {
    constructor(config = {}) {
        this.config = {
            level: config.level || 'info',
            maxFileSize: config.maxFileSize || '10MB',
            maxFiles: config.maxFiles || 5,
            logDir: config.logDir || './data/logs',
            enableConsole: config.enableConsole !== false,
            enableFile: config.enableFile !== false,
            ...config
        };

        this.logLevels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };

        this.currentLogLevel = this.logLevels[this.config.level] || 2;
        this.loggers = new Map();

        // 初始化日志目录
        this.initializeLogDirectory();
    }

    /**
     * 初始化日志目录
     */
    initializeLogDirectory() {
        try {
            if (!fs.existsSync(this.config.logDir)) {
                fs.mkdirSync(this.config.logDir, { recursive: true });
            }
            console.log('✅ 日志目录初始化完成');
        } catch (error) {
            console.error('❌ 初始化日志目录失败:', error);
        }
    }

    /**
     * 获取或创建模块日志器
     * @param {string} moduleName - 模块名称
     * @returns {Object} 日志器对象
     */
    getLogger(moduleName = 'system') {
        if (!this.loggers.has(moduleName)) {
            this.loggers.set(moduleName, new ModuleLogger(moduleName, this.config, this.currentLogLevel));
        }
        return this.loggers.get(moduleName);
    }

    /**
     * 设置日志级别
     * @param {string} level - 日志级别
     */
    setLogLevel(level) {
        this.currentLogLevel = this.logLevels[level] || 2;
        this.config.level = level;

        // 更新所有现有日志器的级别
        for (const logger of this.loggers.values()) {
            logger.setLogLevel(this.currentLogLevel);
        }
    }

    /**
     * 清理旧日志文件
     * @param {number} daysToKeep - 保留天数
     */
    cleanupOldLogs(daysToKeep = 7) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

            const files = fs.readdirSync(this.config.logDir);
            let cleanedCount = 0;

            files.forEach(file => {
                if (file.endsWith('.log')) {
                    const dateMatch = file.match(/_(\d{4}-\d{2}-\d{2})\.log$/);
                    if (dateMatch && dateMatch[1] < cutoffDateStr) {
                        fs.unlinkSync(path.join(this.config.logDir, file));
                        cleanedCount++;
                    }
                }
            });

            if (cleanedCount > 0) {
                this.getLogger('system').info(`清理了 ${cleanedCount} 个旧日志文件`);
            }
        } catch (error) {
            console.error('清理日志文件时出错:', error);
        }
    }

    /**
     * 获取日志统计信息
     * @returns {Object} 日志统计
     */
    getLogStats() {
        try {
            const stats = {
                logDir: this.config.logDir,
                totalFiles: 0,
                totalSize: 0,
                modules: {}
            };

            if (!fs.existsSync(this.config.logDir)) {
                return stats;
            }

            const files = fs.readdirSync(this.config.logDir);
            
            files.forEach(file => {
                if (file.endsWith('.log')) {
                    const filePath = path.join(this.config.logDir, file);
                    const fileStat = fs.statSync(filePath);
                    
                    stats.totalFiles++;
                    stats.totalSize += fileStat.size;

                    // 提取模块名
                    const moduleMatch = file.match(/^(.+)_\d{4}-\d{2}-\d{2}\.log$/);
                    if (moduleMatch) {
                        const moduleName = moduleMatch[1];
                        if (!stats.modules[moduleName]) {
                            stats.modules[moduleName] = { files: 0, size: 0 };
                        }
                        stats.modules[moduleName].files++;
                        stats.modules[moduleName].size += fileStat.size;
                    }
                }
            });

            stats.totalSizeFormatted = this.formatBytes(stats.totalSize);
            
            return stats;
        } catch (error) {
            console.error('获取日志统计时出错:', error);
            return { error: error.message };
        }
    }

    /**
     * 格式化字节大小
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的大小
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

/**
 * 模块日志器
 */
class ModuleLogger {
    constructor(moduleName, config, logLevel) {
        this.moduleName = moduleName;
        this.config = config;
        this.logLevel = logLevel;
        this.currentLogFile = null;
        this.currentDate = null;
    }

    /**
     * 设置日志级别
     * @param {number} level - 日志级别
     */
    setLogLevel(level) {
        this.logLevel = level;
    }

    /**
     * 记录错误日志
     * @param {string} message - 日志消息
     * @param {Object} data - 额外数据
     */
    error(message, data = {}) {
        this.log('error', message, data);
    }

    /**
     * 记录警告日志
     * @param {string} message - 日志消息
     * @param {Object} data - 额外数据
     */
    warn(message, data = {}) {
        this.log('warn', message, data);
    }

    /**
     * 记录信息日志
     * @param {string} message - 日志消息
     * @param {Object} data - 额外数据
     */
    info(message, data = {}) {
        this.log('info', message, data);
    }

    /**
     * 记录调试日志
     * @param {string} message - 日志消息
     * @param {Object} data - 额外数据
     */
    debug(message, data = {}) {
        this.log('debug', message, data);
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     * @param {Object} data - 额外数据
     */
    log(level, message, data = {}) {
        const levelValue = { error: 0, warn: 1, info: 2, debug: 3 }[level] || 2;
        
        if (levelValue > this.logLevel) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            module: this.moduleName,
            message,
            data: Object.keys(data).length > 0 ? data : undefined
        };

        // 控制台输出
        if (this.config.enableConsole) {
            this.logToConsole(logEntry);
        }

        // 文件输出
        if (this.config.enableFile) {
            this.logToFile(logEntry);
        }
    }

    /**
     * 输出到控制台
     * @param {Object} logEntry - 日志条目
     */
    logToConsole(logEntry) {
        const colors = {
            error: '\x1b[31m',   // 红色
            warn: '\x1b[33m',    // 黄色
            info: '\x1b[36m',    // 青色
            debug: '\x1b[37m'    // 白色
        };
        
        const reset = '\x1b[0m';
        const color = colors[logEntry.level] || colors.info;
        
        const prefix = `${color}[${logEntry.timestamp}] ${logEntry.level.toUpperCase()} [${logEntry.module}]${reset}`;
        const message = `${prefix}: ${logEntry.message}`;
        
        if (logEntry.data) {
            console.log(message, logEntry.data);
        } else {
            console.log(message);
        }
    }

    /**
     * 输出到文件
     * @param {Object} logEntry - 日志条目
     */
    logToFile(logEntry) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // 检查是否需要创建新的日志文件
            if (this.currentDate !== today) {
                this.currentDate = today;
                this.currentLogFile = path.join(
                    this.config.logDir, 
                    `${this.moduleName}_${today}.log`
                );
            }

            // 检查文件大小，如果超过限制则轮转
            if (fs.existsSync(this.currentLogFile)) {
                const stats = fs.statSync(this.currentLogFile);
                const maxSize = this.parseSize(this.config.maxFileSize);
                
                if (stats.size > maxSize) {
                    this.rotateLogFile();
                }
            }

            // 写入日志
            const logLine = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(this.currentLogFile, logLine);

        } catch (error) {
            console.error('写入日志文件失败:', error);
        }
    }

    /**
     * 轮转日志文件
     */
    rotateLogFile() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedFile = this.currentLogFile.replace('.log', `_${timestamp}.log`);
            
            fs.renameSync(this.currentLogFile, rotatedFile);
            
            // 清理旧的轮转文件
            this.cleanupRotatedFiles();
            
        } catch (error) {
            console.error('轮转日志文件失败:', error);
        }
    }

    /**
     * 清理旧的轮转文件
     */
    cleanupRotatedFiles() {
        try {
            const files = fs.readdirSync(this.config.logDir);
            const pattern = new RegExp(`^${this.moduleName}_\\d{4}-\\d{2}-\\d{2}_.*\\.log$`);
            
            const rotatedFiles = files
                .filter(file => pattern.test(file))
                .map(file => ({
                    name: file,
                    path: path.join(this.config.logDir, file),
                    mtime: fs.statSync(path.join(this.config.logDir, file)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);

            // 保留最新的几个文件，删除其余的
            if (rotatedFiles.length > this.config.maxFiles) {
                const filesToDelete = rotatedFiles.slice(this.config.maxFiles);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
        } catch (error) {
            console.error('清理轮转文件失败:', error);
        }
    }

    /**
     * 解析大小字符串
     * @param {string} sizeStr - 大小字符串 (如 "10MB")
     * @returns {number} 字节数
     */
    parseSize(sizeStr) {
        const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
        const match = sizeStr.match(/^(\d+)([A-Z]+)$/);
        
        if (!match) return 10 * 1024 * 1024; // 默认10MB
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        return value * (units[unit] || 1);
    }
}

// 创建统一日志管理器实例
export const unifiedLoggerManager = new UnifiedLoggerManager();

// 导出便捷方法
export function getLogger(moduleName) {
    return unifiedLoggerManager.getLogger(moduleName);
}