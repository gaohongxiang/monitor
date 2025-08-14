# Binance价格监控模块

📈 监控指定交易对的价格变化，价格波动超过阈值时发送预警通知。

## 功能说明

- 定时检查交易对价格变化
- 价格变化超过阈值时发送预警
- 支持同时监控多个交易对
- 冷却机制避免频繁预警

## 准备工作

### 必需配置
- 钉钉机器人令牌

### 可选配置
- PostgreSQL数据库（存储价格历史和预警记录）
- 代理服务器（提高API访问稳定性）

## 配置步骤

### 1. 环境变量配置
```bash
# 启用Binance价格监控
BINANCE_PRICE_ENABLED=true

# 监控的交易对（逗号分隔）
BINANCE_PRICE_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT

# 价格变化预警阈值（百分比）
BINANCE_PRICE_THRESHOLD=5.0

# 检查间隔（秒）
BINANCE_PRICE_INTERVAL=60

# 预警冷却期（秒）
BINANCE_PRICE_COOLDOWN=3600

# 通知配置
DINGTALK_ACCESS_TOKEN=your_dingtalk_token
```

### 2. 配置参数说明

- **BINANCE_PRICE_SYMBOLS**: 监控的交易对，用逗号分隔
- **BINANCE_PRICE_THRESHOLD**: 预警阈值，默认5.0（5%）
- **BINANCE_PRICE_INTERVAL**: 检查间隔，默认60秒
- **BINANCE_PRICE_COOLDOWN**: 冷却期，默认3600秒（1小时）

## 使用方法

### 1. 启动监控
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 2. 查看状态
```bash
# 查看价格监控状态
curl http://localhost:3000/status
```



## 常见问题

### API请求失败
- 检查网络连接到api.binance.com
- 验证交易对符号是否正确
- 检查API请求频率是否过高

### 预警不触发
- 检查预警阈值设置是否合理
- 确认价格变化是否超过阈值
- 验证冷却期设置

### 频繁预警
- 增加冷却期时间
- 调整预警阈值
- 检查价格缓存机制

### 数据库写入失败
- 检查数据库连接状态
- 验证表结构是否正确
- 查看数据库权限设置

## 相关链接

- [Binance REST API文档](https://binance-docs.github.io/apidocs/spot/en/)
- [Binance现货交易对列表](https://api.binance.com/api/v3/exchangeInfo)
