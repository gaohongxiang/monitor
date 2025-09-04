# 多源监控系统 - 技术文档

## 项目概述

多源监控系统是一个基于Node.js的统一监控平台，采用模块化架构设计，支持多种监控源的独立管理。系统通过监控编排器统一管理所有监控模块，每个模块可独立启用/禁用，并提供统一的通知和数据管理服务。

## 核心特性

### 🎯 **多源监控支持**
- **Twitter监控** - 定时轮询，多API凭证管理，智能时间调度
- **Binance公告监控** - 实时WebSocket连接，公告推送监控
- **Binance价格监控** - 价格变化预警，多交易对监控

### 🔧 **模块化架构**
- **监控编排器** - 统一管理所有监控模块的生命周期
- **模块化设计** - 每个监控源独立实现，可单独启用/禁用
- **模块内表管理** - 每个模块管理自己的数据库表结构
- **共享服务** - 统一的配置、数据库、通知、日志管理

### 📱 **通知与存储**
- **钉钉通知集成** - 实时推送监控结果到钉钉群
- **数据库持久化** - 使用PostgreSQL存储状态和历史数据
- **模块化表结构** - 每个模块独立管理数据表
- **健康检查** - HTTP API提供系统状态监控

### 🌍 **部署与运维**
- **环境分离** - 支持开发和生产环境配置
- **优雅关闭** - 支持信号处理和资源清理
- **Render部署** - 支持一键部署到云平台

## 系统架构

### 整体架构图

```mermaid
graph TB
    A[主程序 src/index.js] --> B[监控编排器 MonitorOrchestrator]
    A --> C[共享服务层]

    C --> D[配置管理器 UnifiedConfigManager]
    C --> E[数据库管理器 UnifiedDatabaseManager]
    C --> F[通知管理器 UnifiedNotifierManager]
    C --> G[日志管理器 UnifiedLoggerManager]

    B --> H[Twitter监控模块]
    B --> I[Binance公告监控模块]
    B --> J[Binance价格监控模块]

    H --> K[TwitterMonitor]
    H --> L[TwitterScheduler - 定时调度]
    H --> M[TwitterApiClient - API客户端]

    I --> N[BinanceAnnouncementMonitor]
    I --> O[WebSocket连接管理]
    I --> P[实时公告处理]

    J --> Q[BinancePriceMonitor]
    J --> R[价格变化检测]
    J --> S[预警机制]

    K --> T[Twitter API]
    N --> U[Binance WebSocket API]
    Q --> V[Binance REST API]

    F --> W[钉钉机器人API]
    E --> X[PostgreSQL数据库]

    Y[环境变量 .env] --> D
    Z[HTTP健康检查 :3000] --> A
```

### 核心组件

#### 1. 监控编排器 (MonitorOrchestrator)
- **职责**: 统一管理所有监控模块的生命周期
- **功能**:
  - 模块加载和初始化
  - 健康检查和故障恢复
  - 资源分配和状态管理
  - 优雅启动和关闭

#### 2. 共享服务层
- **UnifiedConfigManager**: 统一配置管理，支持模块开关控制
- **UnifiedDatabaseManager**: PostgreSQL连接池和表结构管理
- **UnifiedNotifierManager**: 钉钉通知服务，支持限流和重试
- **UnifiedLoggerManager**: 结构化日志记录和文件管理

#### 3. Twitter监控模块

##### 3.1 Twitter官方API监控
- **TwitterMonitor**: Twitter官方API监控主控制器
- **TwitterScheduler**: 智能时间调度，支持多API凭证轮换
- **TwitterApiClient**: Twitter API客户端，OAuth2认证和推文获取
- **TwitterAuthenticator**: OAuth认证工具，支持BitBrowser指纹浏览器
- **特点**: 定时轮询模式，避免API限流，需要开发者账号

##### 3.2 Twitter OpenAPI监控
- **TwitterOpenApiMonitor**: Twitter OpenAPI监控主控制器
- **TwitterCookieManager**: Cookie管理器，自动刷新ct0令牌
- **TwitterCredentialsManager**: 凭证管理器，数据库存储Cookie
- **特点**: 实时监控模式，无API限制，使用Cookie认证

#### 4. Binance公告监控模块
- **BinanceAnnouncementMonitor**: Binance公告监控器
- **功能**:
  - 实时WebSocket连接管理
  - HMAC SHA256签名认证
  - 心跳机制和自动重连
  - 公告数据实时处理
- **特点**: 实时推送模式，低延迟接收

#### 5. Binance价格监控模块
- **BinancePriceMonitor**: Binance价格监控器
- **功能**:
  - 定时获取交易对价格
  - 价格变化检测和预警
  - 多交易对同时监控
  - 冷却机制防止频繁预警
- **特点**: 定时轮询模式，智能预警

#### 6. HTTP健康检查服务
- **端点**: `http://localhost:3000/health` 和 `/status`
- **功能**: 系统状态监控，支持外部健康检查

## 配置管理

### 环境变量配置
```bash
# ===== 模块控制 =====
TWITTER_ENABLED=false                    # 启用/禁用Twitter监控
BINANCE_ANNOUNCEMENT_ENABLED=true        # 启用/禁用Binance公告监控
BINANCE_PRICE_ENABLED=false             # 启用/禁用Binance价格监控

# ===== 通知配置 =====
DINGTALK_ACCESS_TOKEN=钉钉机器人访问令牌

# ===== Binance公告监控配置 =====
BINANCE_API_KEY=你的Binance_API密钥
BINANCE_SECRET_KEY=你的Binance_Secret密钥

# ===== Binance价格监控配置 =====
BINANCE_PRICE_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT
BINANCE_PRICE_THRESHOLD=5.0
BINANCE_PRICE_INTERVAL=60
BINANCE_PRICE_COOLDOWN=3600

# ===== Twitter定时监控配置 =====
# 需要数据库存储和多API凭证轮询
DATABASE_URL=postgresql://用户:密码@主机:端口/数据库名

# Twitter API凭证配置（JSON格式）
API_CREDENTIALS='[
  {
    "monitorUser": "binancezh",
    "credentials": [
      {
        "username": "X用户名1",
        "clientId": "客户端ID1",
        "clientSecret": "客户端密钥1",
        "redirectUri": "重定向URI",
        "browserId": "指纹浏览器ID1",
        "proxyUrl": "代理地址1"
      },
      {
        "username": "X用户名2",
        "clientId": "客户端ID2",
        "clientSecret": "客户端密钥2",
        "redirectUri": "重定向URI",
        "browserId": "指纹浏览器ID2",
        "proxyUrl": "代理地址2"
      }
    ]
  },
  {
    "monitorUser": "elonmusk",
    "credentials": [
      {
        "username": "X用户名3",
        "clientId": "客户端ID3",
        "clientSecret": "客户端密钥3",
        "redirectUri": "重定向URI",
        "browserId": "指纹浏览器ID3",
        "proxyUrl": "代理地址3"
      }
    ]
  }
]'

# Twitter官方API可选配置
MONITOR_START_TIME=09:00  # 生产环境监控开始时间（北京时间UTC+8）
MONITOR_END_TIME=23:00    # 生产环境监控结束时间（北京时间UTC+8）

# Twitter OpenAPI配置
TWITTER_OPENAPI_ENABLED=true
TWITTER_MONITOR_USERS=elonmusk,sundarpichai  # 要监控的用户
TWITTER_OPENAPI_INTERVAL=300                 # 检查间隔（秒）
# TWITTER_OPENAPI_PROXY=socks://username:password@proxy_host:proxy_port
```

### 数据库表结构

系统采用**模块化表管理**，每个模块管理自己的数据库表结构。

#### 共享表结构
```sql
-- 通知历史表（所有模块共享）
CREATE TABLE notification_history (
    id SERIAL PRIMARY KEY,
    module_name VARCHAR(50) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    recipient VARCHAR(100) DEFAULT 'dingtalk',
    status VARCHAR(20) DEFAULT 'sent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Twitter监控模块表结构

##### Twitter官方API表结构
```sql
-- Twitter刷新令牌表（官方API使用）
CREATE TABLE twitter_refresh_tokens (
    username VARCHAR(255) UNIQUE NOT NULL,
    refresh_token TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

##### Twitter共享表结构
```sql
-- Twitter凭证管理表（官方API和OpenAPI共用）
CREATE TABLE twitter_credentials (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    refresh_token TEXT,                    -- 官方API使用
    openapi_auth_token TEXT,               -- OpenAPI使用
    openapi_ct0_token TEXT,                -- OpenAPI使用
    openapi_ct0_updated_at TIMESTAMP,      -- CT0更新时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Twitter处理记录表（防重复，两种API共用）
CREATE TABLE twitter_processed_records (
    id SERIAL PRIMARY KEY,
    monitor_user VARCHAR(255) NOT NULL,
    last_tweet_id VARCHAR(50),
    last_check_time TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Binance公告监控模块表结构
```sql
-- Binance处理记录表（防重复）
CREATE TABLE binance_processed_records (
    id SERIAL PRIMARY KEY,
    announcement_id VARCHAR(255) NOT NULL UNIQUE,
    title TEXT,
    catalog_name VARCHAR(100),
    publish_date TIMESTAMP,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    module_name VARCHAR(50) DEFAULT 'binance_announcement'
);
```

#### Binance价格监控模块表结构
```sql
-- 价格预警表
CREATE TABLE price_alerts (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    alert_type VARCHAR(20) NOT NULL,
    threshold_value DECIMAL(20, 8) NOT NULL,
    current_price DECIMAL(20, 8),
    change_percent DECIMAL(5, 2),
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_processed BOOLEAN DEFAULT FALSE,
    module_name VARCHAR(50) DEFAULT 'binance_price'
);

-- 价格历史表
CREATE TABLE price_history (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    volume DECIMAL(20, 8),
    change_24h DECIMAL(5, 2),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    module_name VARCHAR(50) DEFAULT 'binance_price'
);
```

## Twitter数据处理流程详解

### getUserTweetsAndReplies API 数据流分析

Twitter OpenAPI的`getUserTweetsAndReplies`接口返回的数据结构比较复杂，包含推文和回复线程的组合。理解这个数据流对于正确处理Twitter内容至关重要。

#### 1. API 返回的原始数据结构

```javascript
// getUserTweetsAndReplies API 返回结构
{
  data: {
    data: [
      // 推文包装器 1
      {
        tweet: {
          restId: "1963490180205105558",
          legacy: {
            fullText: "#币安钱包 网页版返佣页面功能指南🧭...",
            createdAt: "Thu Sep 04 06:31:53 +0000 2025",
            inReplyToStatusIdStr: null,        // null = 原创推文
            inReplyToScreenName: null
          }
        },
        replies: [
          // 这个推文下的回复线程
          {
            tweet: {
              restId: "1963495000000000000",
              legacy: {
                fullText: "补充信息：活动截止到...",
                inReplyToStatusIdStr: "1963490180205105558",  // 回复上面的推文
                inReplyToScreenName: "binancezh"
              }
            },
            user: {
              legacy: {
                screenName: "binancezh",  // 自己回复自己 = 自回复
                userId: "1451036242431262720"
              }
            }
          },
          {
            tweet: {
              restId: "1963496000000000000",
              legacy: {
                fullText: "@binancezh 什么时候开始？",
                inReplyToStatusIdStr: "1963490180205105558",
                inReplyToScreenName: "binancezh"
              }
            },
            user: {
              legacy: {
                screenName: "other_user",  // 别人的回复
                userId: "9999999999999999999"
              }
            }
          }
        ]
      }
    ]
  }
}
```

#### 2. getOpenApiTweets 数据处理流程

```mermaid
flowchart TD
    A[getUserTweetsAndReplies API返回] --> B[过滤推广内容]
    B --> C[遍历推文包装器]
    C --> D[处理主推文]
    C --> E[处理回复线程]
    
    D --> F{判断推文类型}
    F -->|inReplyToStatusIdStr == null| G[原创推文 ✅ 收集]
    F -->|inReplyToScreenName == 监控用户| H[自回复推文 ✅ 收集]
    F -->|回复他人| I[跳过 ❌]
    
    E --> J{判断回复者}
    J -->|screenName == 监控用户| K[自回复 ✅ 收集]
    J -->|其他用户| L[跳过 ❌]
    
    G --> M[时间过滤]
    H --> M
    K --> M
    M --> N[排序和限制数量]
    N --> O[返回最终结果]
```

#### 3. 处理步骤详解

**步骤1: 过滤推广内容**
```javascript
const realTweets = tweets.filter(tweetWrapper => !tweetWrapper.promotedMetadata);
```

**步骤2: 遍历推文包装器**
```javascript
realTweets.forEach(tweetWrapper => {
    const tweet = tweetWrapper.tweet;
    const replies = tweetWrapper.replies || [];
    
    // 处理主推文和回复线程
});
```

**步骤3: 处理主推文**
```javascript
// 判断推文类型
if (!tweet.legacy.inReplyToStatusIdStr) {
    // 原创推文 ✅ 收集
    allContent.push(formatTweetContent(tweet, 'original'));
} else if (tweet.legacy.inReplyToScreenName === monitorUser) {
    // 自回复推文 ✅ 收集
    allContent.push(formatTweetContent(tweet, 'self_reply'));
}
// 回复他人的推文 ❌ 跳过
```

**步骤4: 处理回复线程**
```javascript
replies.forEach(reply => {
    if (reply.user?.legacy?.screenName === monitorUser) {
        // 自回复 ✅ 收集
        allContent.push(formatTweetContent(reply.tweet, 'self_reply_in_thread'));
    }
    // 他人回复 ❌ 跳过
});
```

**步骤5: 时间过滤**
```javascript
if (sinceId) {
    allContent = allContent.filter(item => 
        BigInt(item.id) > BigInt(sinceId)
    );
}
```

**步骤6: 排序和限制**
```javascript
allContent.sort((a, b) => BigInt(b.id) - BigInt(a.id)); // 按ID降序
return allContent.slice(0, Number(options.count));
```

#### 4. 实际处理示例

**输入数据:**
```javascript
// 推文包装器1
{
  tweet: "原创推文A (ID: 123)",
  replies: [
    "binancezh的自回复 (ID: 124)",
    "other_user的回复 (ID: 125)"
  ]
}

// 推文包装器2  
{
  tweet: "自回复推文B (ID: 126, 回复推文ID: 120)",
  replies: [
    "binancezh的自回复 (ID: 127)",
    "another_user的回复 (ID: 128)"
  ]
}
```

**处理结果:**
```javascript
// 步骤3 - 处理主推文
✅ 推文A (ID: 123) → 原创推文，收集
✅ 推文B (ID: 126) → 自回复推文，收集

// 步骤4 - 处理回复线程  
✅ 自回复 (ID: 124) → binancezh的回复，收集
❌ 回复 (ID: 125) → other_user的回复，跳过
✅ 自回复 (ID: 127) → binancezh的回复，收集
❌ 回复 (ID: 128) → another_user的回复，跳过
```

**最终输出:**
```javascript
[
  { id: "127", text: "binancezh的自回复", type: "self_reply_in_thread" },
  { id: "126", text: "自回复推文B", type: "self_reply" },
  { id: "124", text: "binancezh的自回复", type: "self_reply_in_thread" },
  { id: "123", text: "原创推文A", type: "original" }
]
```

#### 5. 关键设计原则

1. **完整性**: 收集用户的所有原创内容和自回复
2. **准确性**: 排除回复他人的内容，避免噪音
3. **时效性**: 支持增量更新，只获取新内容
4. **一致性**: 统一的数据格式和处理逻辑

这种设计确保能够完整捕获币安等官方账号的主推文和后续的自回复补充信息，同时过滤掉无关的用户回复。

## 核心工作流程

### 系统启动流程

```mermaid
sequenceDiagram
    participant Main as src/index.js
    participant Orchestrator as MonitorOrchestrator
    participant Config as UnifiedConfigManager
    participant DB as UnifiedDatabaseManager
    participant Twitter as TwitterMonitor
    participant Binance as BinanceAnnouncementMonitor

    Main->>Config: 加载配置
    Config->>Config: 检查模块开关
    Main->>DB: 初始化数据库
    Main->>Orchestrator: 创建编排器

    Orchestrator->>Twitter: 加载Twitter模块 (如果启用)
    Twitter->>Twitter: 初始化API客户端
    Twitter->>Twitter: 创建调度器

    Orchestrator->>Binance: 加载Binance模块 (如果启用)
    Binance->>Binance: 建立WebSocket连接
    Binance->>Binance: 订阅公告主题

    Orchestrator->>Orchestrator: 启动健康检查
    Main->>Main: 启动HTTP服务器
```

### Twitter监控工作流程

#### 智能时间调度算法
```javascript
// 每个API每天3次请求，总请求数 = API数量 × 3
const totalRequests = apiCredentialCount * 3;

// 固定开始和结束时间，中间均匀分配
for (let i = 0; i < totalRequests; i++) {
    let timeMinutes;

    if (i === 0) {
        // 第一次请求：开始时间
        timeMinutes = startMinutes;
    } else if (i === totalRequests - 1) {
        // 最后一次请求：结束时间
        timeMinutes = endMinutes;
    } else {
        // 中间的请求：均匀分配
        const intervalMinutes = totalMinutes / (totalRequests - 1);
        timeMinutes = startMinutes + (i * intervalMinutes);
    }

    scheduleTimes.push({
        hour: Math.floor(timeMinutes / 60),
        minute: Math.floor(timeMinutes % 60),
        credentialIndex: i % apiCredentialCount // 轮换使用API凭证
    });
}
```

**调度示例：**
- **1个API**：3次请求 → 09:00, 16:00, 23:00
- **2个API**：6次请求 → 09:00, 11:48, 14:36, 17:24, 20:12, 23:00
- **3个API**：9次请求 → 09:00, 10:45, 12:30, 14:15, 16:00, 17:45, 19:30, 21:15, 23:00

### Binance监控工作流程

#### WebSocket连接管理
```javascript
// 1. 生成签名
const signatureString = `random=${random}&topic=${topic}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
const signature = crypto.createHmac('sha256', secretKey).update(signatureString).digest('hex');

// 2. 建立连接
const wsUrl = `wss://api.binance.com/sapi/wss?${signatureString}&signature=${signature}`;
const ws = new WebSocket(wsUrl);

// 3. 心跳机制
setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
    }
}, 30000);

// 4. 消息处理
ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.type === 'DATA' && message.topic === 'com_announcement_en') {
        processAnnouncement(message.data);
    }
});
```

#### 开发模式（NODE_ENV=development）
```javascript
// 从当前北京时间+3秒开始，按TEST_INTERVAL间隔执行
const beijingTime = getCurrentBeijingTime();
const startTime = new Date(beijingTime.getTime() + 3000);

for (let i = 0; i < apiCredentialCount; i++) {
    const testTime = new Date(startTime.getTime() + (i * testIntervalMinutes * 60 * 1000));
    scheduleTimes.push({
        hour: testTime.getHours(),
        minute: testTime.getMinutes(),
        second: testTime.getSeconds(),
        credentialIndex: i
    });
}
```

#### DeepL翻译集成
Binance监控使用DeepL API进行英文公告的中文翻译：

```javascript
// DeepL翻译实现
async translateToChineseWithRetry(text, maxRetries = 3) {
    const deeplApiKey = process.env.DEEPL_API_KEY;
    
    if (!deeplApiKey) {
        console.warn('⚠️  DeepL API密钥未配置，返回原文');
        return text;
    }

    const translator = new deepl.Translator(deeplApiKey);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await translator.translateText(text, 'en', 'zh');
            return result.text;
        } catch (error) {
            if (attempt === maxRetries) {
                return text; // 翻译失败时返回原文
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}
```

**DeepL翻译特性：**
- **高质量翻译** - 特别适合金融和技术术语
- **免费额度** - 每月50万字符，足够监控系统使用
- **自动重试** - 翻译失败时自动重试，最终返回原文
- **错误容错** - 翻译服务异常时不影响监控主流程

### 通知系统工作流程

#### 统一通知管理器
```javascript
class UnifiedNotifierManager {
    async sendNotification(source, data) {
        // 根据来源格式化消息
        const message = this.formatMessage(source, data);

        // 发送到钉钉
        return await this.dingTalkNotifier.sendMessage(message);
    }

    formatMessage(source, data) {
        switch (source) {
            case 'twitter':
                return this.formatTwitterMessage(data);
            case 'binance':
                return this.formatBinanceMessage(data);
            default:
                return data;
        }
    }
}
```

#### 消息格式化示例
```javascript
// Twitter消息格式
{
    title: "🐦 Twitter新推文",
    content: `用户: @${username}\n内容: ${content}\n时间: ${created_at}\n链接: ${url}`
}

// Binance消息格式
{
    title: "📢 Binance公告",
    content: `标题: ${title}\n分类: ${catalogName}\n时间: ${publishTime}\n链接: ${url}`
}
```

## 环境管理

### 开发环境
```bash
# 启动开发环境
npm run dev

# 自动设置的环境变量
NODE_ENV=development

# 特点
- Twitter监控：立即开始测试（当前时间+3秒）
- Binance监控：立即建立WebSocket连接
- 详细的调试日志
- 支持热重载测试
```

### 生产环境
```bash
# 启动生产环境
npm start

# 自动设置的环境变量
NODE_ENV=production

# 特点
- Twitter监控：使用固定的开始/结束时间调度
- Binance监控：24小时实时WebSocket连接
- 优化的日志级别
- 自动重连和错误重试机制
```

## 模块管理系统

### 模块控制
```bash
# 环境变量控制模块启用/禁用
TWITTER_ENABLED=true   # 启用Twitter监控
BINANCE_ENABLED=true   # 启用Binance监控

# 可以独立控制
TWITTER_ENABLED=false  # 只启用Binance监控
BINANCE_ENABLED=true

TWITTER_ENABLED=true   # 只启用Twitter监控
BINANCE_ENABLED=false
```

### 模块生命周期管理
```javascript
class MonitorOrchestrator {
    async loadModules() {
        const enabledModules = this.config.getEnabledModules();

        for (const moduleName of enabledModules) {
            const module = await this.createModule(moduleName);
            await module.initialize();
            this.modules.set(moduleName, module);
        }
    }

    async startHealthCheck() {
        setInterval(() => {
            for (const [name, module] of this.modules) {
                if (!module.isHealthy()) {
                    this.logger.warn(`模块 ${name} 不健康，尝试恢复`);
                    this.recoverModule(name);
                }
            }
        }, 30000);
    }
}
```

## Twitter认证系统

### Twitter官方API认证

#### 认证流程
```bash
# 认证所有Twitter官方API凭证
npm run twitter:official:refresh-token:auth

# 检查认证状态
npm run twitter:official:refresh-token:check
```

### Twitter OpenAPI凭证管理

#### 凭证管理流程
```bash
# 启动凭证管理器
npm run twitter:openapi:credentials

# 选择操作：
# 1. 添加/更新用户凭证
# 2. 查看所有凭证
# 3. 删除用户凭证
# 4. 检查ct0令牌状态
```

#### Twitter官方API认证工作原理
1. **读取配置** - 从环境变量解析API_CREDENTIALS
2. **数据库初始化** - 自动创建必要的表结构
3. **浏览器启动** - 使用指纹浏览器进行OAuth认证
4. **Token保存** - 将获得的refreshToken保存到数据库
5. **状态验证** - 验证认证是否成功

#### Twitter OpenAPI凭证管理原理
1. **Cookie获取** - 用户从浏览器手动获取auth_token和ct0
2. **凭证存储** - 通过管理脚本将Cookie存储到数据库
3. **自动检测** - 系统自动选择最佳的Cookie用户
4. **令牌刷新** - ct0令牌自动刷新和状态监控
5. **健康检查** - 定期验证Cookie有效性

**注意**：Binance监控只需要API密钥，无需认证流程。

## 统一数据库管理

### UnifiedDatabaseManager

统一数据库管理器支持多监控源的数据存储，采用智能的按需重连策略。

#### 核心特性

```javascript
class UnifiedDatabaseManager {
    // 支持多种数据操作
    async saveTweet(tweetData)              // Twitter推文存储
    async saveBinanceAnnouncement(data)     // Binance公告存储
    async updateMonitorState(user, module, state)  // 监控状态更新
    async getMonitorState(user, module)     // 监控状态查询
    async updateModuleStatus(module, status) // 模块状态管理
}
```

#### 智能重连机制

```javascript
// 每次数据库操作前自动检查连接
async ensureConnection() {
    if (this.isInitialized && this.pool) {
        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            return true;
        } catch (error) {
            console.log('数据库连接异常，尝试重新初始化...');
            return await this.initialize();
        }
    }

    return await this.initialize();
}

// 所有数据库操作都使用此模式
async saveTweet(tweetData) {
    if (!await this.ensureConnection()) return false;

    try {
        const result = await this.pool.query(query, values);
        return result.rowCount > 0;
    } catch (error) {
        console.error('保存推文失败:', error.message);
        return false;
    }
}
```

#### 优势对比

| 方案 | 定时保活 | 按需重连 |
|------|----------|----------|
| **资源消耗** | 每2分钟查询一次 | 只在需要时检查 |
| **数据库负载** | 持续产生负载 | 最小化负载 |
| **重连时机** | 固定间隔 | 监控任务触发时 |
| **系统稳定性** | 可能仍有断开风险 | 自然的重连时机 |
| **代码复杂度** | 需要额外的定时器 | 集成在业务流程中 |

#### 连接状态处理

```javascript
// 连接池事件监听
this.pool.on('error', (err) => {
    console.error('数据库连接池错误:', err.message);
    this.isConnected = false;
    
    // 记录详细错误信息
    console.error('错误详情:', {
        code: err.code,
        errno: err.errno,
        syscall: err.syscall
    });
});

// 异常处理优化
process.on('uncaughtException', (error) => {
    // 区分数据库连接错误和其他严重错误
    if (error.message.includes('Connection terminated') ||
        error.message.includes('connection closed')) {
        console.log('数据库连接错误，等待重连机制处理...');
        return; // 不退出程序
    }
    
    // 其他严重错误才退出程序
    console.error('严重错误，开始优雅关闭...');
    shutdown('uncaughtException');
});
```

#### 重连流程

```mermaid
flowchart TD
    Monitor([监控任务触发]) --> CheckConn{检查数据库连接}
    CheckConn -->|连接正常| Execute[执行监控逻辑]
    CheckConn -->|连接断开| Reconnect[尝试重连]
    
    Reconnect --> ReconnResult{重连结果}
    ReconnResult -->|成功| Execute
    ReconnResult -->|失败| Skip[跳过本次监控]
    
    Execute --> Complete([任务完成])
    Skip --> Wait[等待下次监控]
    Wait --> Monitor
```

#### 配置优化

```javascript
// 连接池配置优化
const poolConfig = {
    max: 5,                    // 减少最大连接数
    min: 1,                    // 减少最小连接数
    idleTimeoutMillis: 240000, // 4分钟空闲超时
    connectionTimeoutMillis: 5000,
    acquireTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 30000
};
```

## 错误处理策略

### 错误分类

#### Twitter监控错误
1. **认证错误**
   - OAuth2认证失败: 记录错误，跳过该凭证
   - 刷新令牌过期: 自动重新认证
   - 指纹浏览器错误: 重试3次后跳过

2. **API错误**
   - 限流错误(429): 立即轮换凭证
   - 认证错误(401): 重新认证凭证
   - 网络错误: 重试3次，指数退避

#### Binance监控错误
1. **WebSocket连接错误**
   - 连接失败: 自动重连机制，最多重试5次
   - 认证失败(-1022): 检查API密钥和签名
   - 网络断开: 立即尝试重连

2. **数据处理错误**
   - 消息解析失败: 记录原始数据，跳过该消息
   - 通知发送失败: 重试3次后记录失败

#### 系统错误
1. **配置错误**: 显示详细错误信息，停止相关模块
2. **数据库错误**: 实现智能重连机制
3. **模块健康检查失败**: 自动重启不健康的模块

### 重试机制
```javascript
const retryConfig = {
    maxRetries: 3,
    retryDelay: 5000, // 5秒
    backoffMultiplier: 2
};

// 指数退避重试
async function executeWithRetry(taskId, callback) {
    let delay = retryConfig.retryDelay;
    
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                await sleep(delay);
                delay *= retryConfig.backoffMultiplier;
            }
            
            await callback();
            return; // 成功执行，退出重试循环
            
        } catch (error) {
            if (attempt === retryConfig.maxRetries) {
                throw error; // 最后一次尝试失败，抛出错误
            }
        }
    }
}
```

## 性能优化

### 内存优化
- 使用Map存储活跃客户端，自动清理过期连接
- 限制日志文件大小，定期清理旧日志
- 推文数据按日期分片存储

### 并发控制
- 同一用户的不同凭证串行执行，避免冲突
- 不同用户的监控任务并行执行
- 限制同时活跃的HTTP连接数

### 数据库优化
- 使用连接池管理数据库连接
- 添加适当的索引优化查询性能
- 实现数据库操作的fallback机制
- **按需重连机制** - 每次监控时检查连接状态，断开时自动重连

## 监控和日志

### 日志策略
- **结构化日志** - 使用JSON格式，便于查询和分析
- **分级记录** - DEBUG/INFO/WARN/ERROR四个级别
- **模块分类** - 按功能模块分类记录
- **定期轮转** - 自动清理过期日志文件

### 健康检查

#### HTTP健康检查端点
```javascript
// 基础健康状态
GET /health
{
  "status": "healthy",
  "uptime": 3600000,
  "timestamp": "2025-08-04T12:00:00.000Z"
}

// 详细系统状态
GET /status
{
  "system": {
    "status": "healthy",
    "uptime": 3600000,
    "startTime": "2025-08-04T11:00:00.000Z"
  },
  "modules": {
    "twitter": {
      "enabled": true,
      "status": "running",
      "isHealthy": true,
      "activeClients": 4,
      "totalUsers": 2,
      "lastCheck": "2025-08-04T11:59:00.000Z"
    },
    "binance": {
      "enabled": true,
      "status": "running",
      "isHealthy": true,
      "isConnected": true,
      "connectionTime": "2025-08-04T11:00:05.000Z",
      "messagesReceived": 15,
      "lastHeartbeat": "2025-08-04T11:59:30.000Z"
    }
  },
  "database": {
    "connected": true,
    "poolSize": 5,
    "activeConnections": 2
  },
  "notifications": {
    "dingTalk": {
      "configured": true,
      "lastSent": "2025-08-04T11:58:00.000Z"
    }
  }
}
```

### 性能指标

#### Twitter监控指标
- API调用成功率和限流状态
- 推文获取统计和去重率
- 凭证轮换频率
- 认证状态和token有效性

#### Binance监控指标
- WebSocket连接稳定性
- 消息接收和处理统计
- 重连次数和成功率
- 心跳响应时间

#### 系统整体指标
- 内存和CPU使用率
- 数据库连接池状态
- 通知发送成功率
- 错误率和重试统计

## 安全考虑

### 敏感数据保护
- **环境变量存储** - 所有敏感信息存储在环境变量中
- **数据库加密** - refreshToken等敏感数据加密存储
- **代理支持** - 支持SOCKS代理保护网络请求
- **访问控制** - 数据库访问权限控制

### 网络安全
- **HTTPS通信** - 所有API调用使用HTTPS
- **代理轮换** - 支持多代理轮换使用
- **请求限制** - 遵循API限流规则
- **错误隐藏** - 生产环境隐藏敏感错误信息

## 部署架构

### Render部署
- **自动容器化** - 支持Render的自动容器化
- **环境变量管理** - 通过Render控制台管理环境变量
- **数据库集成** - 使用Supabase PostgreSQL数据库服务
- **健康检查** - 内置HTTP健康检查端点
- **保活监控** - 使用UptimeRobot防止服务休眠

### 部署配置
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

## 使用指南

### 快速开始
1. **环境准备**
   ```bash
   # 克隆项目
   git clone <repository>
   cd twitter-multi-user-monitor
   
   # 安装依赖
   npm install
   ```

2. **配置环境变量**
   ```bash
   # 复制环境变量模板
   cp .env.example .env
   
   # 编辑.env文件，填入实际配置
   nano .env
   ```

3. **认证API凭证**
   ```bash
   # 认证所有凭证
   npm run twitter:official:refresh-token:auth

   # 检查认证状态
   npm run twitter:official:refresh-token:check
   ```

4. **启动系统**
   ```bash
   # 开发环境
   npm run dev
   
   # 生产环境
   npm start
   ```

### 常用命令
```bash
# 生产部署
npm start            # 生产模式启动

# 开发模式
npm run dev          # 开发模式启动（测试间隔1分钟）

# Twitter认证管理（仅Twitter官方API监控需要）
npm run twitter:official:refresh-token:auth   # 认证所有Twitter凭证
npm run twitter:official:refresh-token:check  # 检查Twitter认证状态

# Twitter OpenAPI凭证管理
npm run twitter:openapi:credentials           # OpenAPI凭证管理器
```

### 配置示例
```bash
# .env文件示例 - 多源监控配置
# 模块控制
TWITTER_OFFICIAL_ENABLED=true      # Twitter官方API监控
TWITTER_OPENAPI_ENABLED=true       # Twitter OpenAPI监控
BINANCE_ANNOUNCEMENT_ENABLED=true  # Binance公告监控
BINANCE_PRICE_ENABLED=true         # Binance价格监控

# 通用配置
DINGTALK_ACCESS_TOKEN=your_dingtalk_token
DATABASE_URL=postgresql://user:pass@host:port/db

# Binance监控配置
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key

# Twitter官方API监控配置
API_CREDENTIALS='[
  {
    "monitorUser": "binancezh",
    "credentials": [
      {
        "username": "X用户名1",
        "clientId": "客户端ID1",
        "clientSecret": "客户端密钥1",
        "redirectUri": "重定向URI",
        "browserId": "指纹浏览器ID1",
        "proxyUrl": "代理地址1"
      }
    ]
  }
]'

# Twitter OpenAPI监控配置
TWITTER_MONITOR_USERS=elonmusk,sundarpichai
TWITTER_OPENAPI_INTERVAL=300
MONITOR_START_TIME=09:00  # 北京时间UTC+8
MONITOR_END_TIME=23:00    # 北京时间UTC+8
```

## 故障排除

### 常见问题

#### Twitter监控问题
1. **认证失败**
   - 检查API凭证配置是否正确
   - 确认指纹浏览器ID有效
   - 验证代理连接是否正常

2. **监控不执行**
   - 检查时间调度配置
   - 确认API凭证已认证
   - 查看系统日志错误信息

#### Binance监控问题
1. **WebSocket连接失败**
   - 检查BINANCE_API_KEY和BINANCE_SECRET_KEY
   - 验证网络连接到api.binance.com
   - 确认API密钥权限设置

2. **签名验证失败(-1022)**
   - 检查系统时间同步
   - 验证API密钥格式
   - 确认密钥权限包含"现货与杠杆交易"

#### 系统通用问题
1. **数据库连接失败**
   - 检查DATABASE_URL格式
   - 确认数据库服务是否运行
   - 验证网络连接和防火墙设置

2. **钉钉通知失败**
   - 验证DINGTALK_ACCESS_TOKEN
   - 检查网络连接
   - 确认钉钉机器人配置

3. **模块启动失败**
   - 检查模块开关配置（TWITTER_ENABLED/BINANCE_ENABLED）
   - 查看具体模块的错误日志
   - 验证相关配置是否完整

### 调试技巧
```bash
# 启用详细日志
DEBUG=* npm run dev

# 检查系统状态
curl http://localhost:3000/health

# 查看认证状态
npm run twitter:official:refresh-token:check

# 手动测试单个功能
node -e "require('./src/test_specific_function.js')"
```

## 技术选型说明

### Twitter API选择

#### Twitter API v2 vs v1.1
**选择：Twitter API v2**

**原因：**
- ✅ **官方推荐** - Twitter官方主推的新版本API
- ✅ **更好的数据结构** - 返回的JSON结构更清晰，支持更多字段
- ✅ **长推文支持** - 原生支持获取完整长推文内容（note_tweet字段）
- ✅ **更高的限额** - 相比v1.1有更合理的限流策略
- ✅ **持续维护** - v1.1已停止新功能开发

**API限制：**
- **免费版限制**：每月50万条推文，每15分钟300次请求
- **基础版限制**：每月1000万条推文，每15分钟1500次请求
- **企业版限制**：无限制，但价格昂贵

**我们的应对策略：**
- 每次请求限制获取10条推文
- 每个API凭证每天最多3次请求
- 多API凭证轮换使用
- 智能时间分配，避免集中请求

### 数据库选择

#### PostgreSQL vs MySQL vs MongoDB
**选择：PostgreSQL**

**PostgreSQL优势：**
- ✅ **JSON支持** - 原生支持JSON数据类型，适合存储推文数据
- ✅ **ACID特性** - 强一致性，确保数据完整性
- ✅ **扩展性** - 支持复杂查询和索引优化
- ✅ **开源免费** - 无许可费用，社区活跃
- ✅ **云平台支持** - 主流云平台原生支持，一键部署

**vs MySQL：**
- PostgreSQL的JSON处理能力更强
- 更好的并发处理性能
- 更丰富的数据类型支持

**vs MongoDB：**
- 关系型数据库更适合我们的数据结构
- 更好的事务支持
- 更成熟的运维工具

**数据库设计考虑：**
```sql
-- 使用username作为主键，简化查询
CREATE TABLE refresh_tokens (
    username VARCHAR(50) PRIMARY KEY,  -- 而不是复杂的credential_id
    refresh_token TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 支持时间范围查询的索引
CREATE INDEX idx_monitor_state_time ON monitor_state(last_check_time);
CREATE INDEX idx_monitor_state_success ON monitor_state(last_success_time);
```

### 部署平台选择

#### Render vs Heroku vs Vercel vs AWS
**选择：Render**

**Render优势：**
- ✅ **简单部署** - GitHub连接后自动部署，无需复杂配置
- ✅ **免费额度充足** - 750小时/月，足够小项目使用
- ✅ **环境变量管理** - 友好的环境变量配置界面
- ✅ **容器化支持** - 自动检测Node.js项目并容器化
- ✅ **健康检查** - 内置健康检查机制

**vs Heroku：**
- Render免费版更持久
- 更现代的用户界面
- 更好的性能表现

**vs Vercel：**
- Vercel主要面向前端，不适合长时间运行的后端服务
- Render更适合定时任务和数据库应用

**vs AWS：**
- Render配置更简单，无需复杂的AWS服务配置
- 更适合中小型项目
- 成本更可控

### 任务调度选择

#### node-cron vs node-schedule vs Bull Queue
**选择：node-cron**

**node-cron优势：**
- ✅ **轻量级** - 无需额外的Redis依赖
- ✅ **简单易用** - 类似Linux cron的语法
- ✅ **内存占用小** - 适合单实例部署
- ✅ **时区支持** - 原生支持时区设置

**vs node-schedule：**
- node-cron的cron语法更标准
- 更好的时区处理

**vs Bull Queue：**
- Bull需要Redis，增加了系统复杂度
- 我们的场景不需要分布式队列

**时间调度实现：**
```javascript
// 支持秒级精度（开发模式）
const cronExpression = `${second} ${minute} ${hour} * * *`;

// 分钟级精度（生产模式）
const cronExpression = `${minute} ${hour} * * *`;

// 北京时间支持
cron.schedule(cronExpression, callback, {
    timezone: 'Asia/Shanghai'
});
```

### 认证方案选择

#### 预先认证 vs 实时认证
**选择：预先认证系统**

**预先认证优势：**
- ✅ **服务器友好** - 避免在服务器环境中启动浏览器
- ✅ **稳定性高** - 认证完成后系统可以稳定运行
- ✅ **安全性好** - 认证过程在本地完成，减少服务器风险
- ✅ **部署简单** - 部署时只需要设置环境变量

**实现方案：**
```bash
# 本地认证
npm run auth          # 批量认证所有凭证
npm run auth:check    # 检查认证状态

# 服务器运行
npm start            # 直接使用数据库中的token
```

## Binance价格监控技术实现

### 概述

Binance价格监控器支持两种数据获取方式的混合使用：
- **WebSocket实时监控**: 毫秒级延迟，实时获取24小时涨跌幅数据
- **REST API定期检查**: 用于每日报告和数据备份

### 核心技术原理

#### 1. 24小时涨跌幅计算

币安APP上显示的涨跌幅使用以下公式：

```javascript
涨跌幅(%) = ((当前价格 - 24小时前价格) / 24小时前价格) × 100
```

**WebSocket数据格式**：
```javascript
{
  "e": "24hrTicker",     // 事件类型
  "s": "ETHUSDT",        // 交易对
  "P": "-0.85",          // 24小时涨跌幅 ← 关键字段
  "c": "4615.74",        // 当前价格
  "o": "4655.24",        // 24小时前开盘价
  "h": "4788.00",        // 24小时最高价
  "l": "4364.69",        // 24小时最低价
  "v": "120870000"       // 24小时成交量
}
```

#### 2. WebSocket连接实现

**连接URL构建**：
```javascript
// 单个交易对
wss://stream.binance.com:9443/ws/btcusdt@ticker

// 多个交易对
wss://stream.binance.com:9443/ws/btcusdt@ticker/ethusdt@ticker/bnbusdt@ticker
```

**关键特性**：
- 实时推送：价格变化时立即推送数据
- 零API配额：不消耗REST API请求配额
- 低延迟：毫秒级数据更新
- 自动重连：网络断开时自动重连

#### 3. 混合监控架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WebSocket     │    │  BinancePriceMonitor │    │   REST API      │
│   实时监控      │───▶│     混合监控器       │◀───│   定期检查      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   实时价格预警   │    │   统一通知系统    │    │   每日价格报告   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 实现细节

#### 1. 配置参数

```javascript
const config = {
    // 基础配置
    symbols: ['BTCUSDT', 'ETHUSDT'],
    alertThreshold: 5.0,
    symbolThresholds: {
        'BTCUSDT': 3.0,
        'ETHUSDT': 4.0
    },

    // 监控模式
    useWebSocket: true,    // 启用WebSocket实时监控
    useRestApi: true,      // 启用REST API定期检查

    // 时间配置
    cooldownPeriod: 3600,  // 预警冷却期（秒）
    checkInterval: 300,    // REST API检查间隔（秒）
    dailyReportTime: '09:00'
};
```

#### 2. 数据流处理

**WebSocket数据流**：
```
Binance服务器 → WebSocket推送 → 解析ticker数据 → 检查阈值 → 发送预警
```

**REST API数据流**：
```
定时器触发 → 请求API → 对比缓存价格 → 检查阈值 → 发送预警/报告
```

#### 3. 错误处理和重连机制

**WebSocket重连策略**：
- 指数退避算法：延迟时间逐次翻倍
- 最大重连次数：10次
- 心跳机制：每30秒发送PING保持连接

**REST API错误处理**：
- 网络错误重试
- API限制处理
- 代理支持

### 性能优化

#### 1. 内存管理

- 使用Map存储价格数据，提高查询效率
- 定期清理过期的预警记录
- 限制缓存大小，防止内存泄漏

#### 2. 网络优化

- 支持SOCKS5代理
- 连接复用和保持
- 压缩数据传输

#### 3. 通知优化

- 冷却机制防止频繁预警
- 批量处理通知消息
- 异步发送，不阻塞主流程

### 部署配置

#### 环境变量

```bash
# 基础配置
BINANCE_PRICE_ENABLED=true
BINANCE_PRICE_SYMBOLS=BTCUSDT,ETHUSDT,BNBUSDT
BINANCE_PRICE_THRESHOLD=5.0

# 监控模式
BINANCE_PRICE_USE_WEBSOCKET=true
BINANCE_PRICE_USE_REST_API=true

# 单独阈值
BINANCE_PRICE_THRESHOLD_BTCUSDT=3.0
BINANCE_PRICE_THRESHOLD_ETHUSDT=4.0

# 网络配置
BINANCE_PROXY_URL=socks5://127.0.0.1:1080

# 通知配置
DINGTALK_ACCESS_TOKEN=your_token
```

#### 监控指标

- WebSocket连接状态
- 数据接收频率
- 预警触发次数
- API请求成功率
- 内存使用情况

### 故障排除

#### 常见问题

1. **WebSocket连接失败**
   - 检查网络连接
   - 验证代理配置
   - 查看防火墙设置

2. **数据不更新**
   - 确认交易对名称正确
   - 检查币安服务状态
   - 验证WebSocket流订阅

3. **预警不触发**
   - 检查阈值设置
   - 确认冷却期配置
   - 验证通知系统

4. **内存使用过高**
   - 检查缓存清理机制
   - 限制监控交易对数量
   - 优化数据结构

---

*本文档持续更新中，如有问题请提交Issue或Pull Request。*

### 代理支持选择

#### SOCKS vs HTTP代理
**选择：SOCKS代理**

**SOCKS代理优势：**
- ✅ **协议无关** - 支持HTTP、HTTPS、WebSocket等所有协议
- ✅ **性能更好** - 更低的延迟和更高的吞吐量
- ✅ **安全性高** - 支持认证和加密
- ✅ **Twitter兼容** - Twitter API对SOCKS代理支持更好

**实现：**
```javascript
import { SocksProxyAgent } from 'socks-proxy-agent';

const agent = new SocksProxyAgent(proxyUrl);
const client = new TwitterApi({
    appKey: clientId,
    appSecret: clientSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
}, {
    agent: agent  // 使用SOCKS代理
});
```

### 浏览器自动化选择

#### Playwright vs Puppeteer vs Selenium
**选择：Playwright**

**Playwright优势：**
- ✅ **多浏览器支持** - 支持Chrome、Firefox、Safari
- ✅ **现代API** - 基于Promise的现代JavaScript API
- ✅ **稳定性高** - 更好的元素等待和错误处理
- ✅ **指纹浏览器兼容** - 与BitBrowser等指纹浏览器集成良好

**vs Puppeteer：**
- Playwright支持更多浏览器
- 更好的跨平台支持

**vs Selenium：**
- Playwright性能更好
- API更现代化

### 通知系统选择

#### 钉钉 vs 企业微信 vs Slack
**选择：钉钉**

**钉钉优势：**
- ✅ **国内普及** - 在中国企业中使用广泛
- ✅ **API简单** - Webhook API简单易用
- ✅ **免费使用** - 基础功能完全免费
- ✅ **消息格式丰富** - 支持文本、链接、图片等多种格式

**API实现：**
```javascript
// 简单的Webhook调用
const response = await axios.post(webhookUrl, {
    msgtype: 'text',
    text: {
        content: message
    }
});
```

### 环境管理选择

#### dotenv vs config vs 直接环境变量
**选择：dotenv + 环境变量**

**混合方案优势：**
- ✅ **开发友好** - 本地使用.env文件，方便开发
- ✅ **生产安全** - 生产环境使用真实环境变量
- ✅ **配置验证** - 统一的配置验证和错误处理
- ✅ **环境分离** - 开发和生产环境完全隔离

**配置层次：**
```javascript
// 1. 环境变量（最高优先级）
process.env.NODE_ENV

// 2. .env文件（开发环境）
NODE_ENV=development

// 3. 默认值（兜底）
const nodeEnv = process.env.NODE_ENV || 'development';
```

## 技术栈

- **运行时**: Node.js 18+
- **数据库**: PostgreSQL
- **任务调度**: node-cron
- **HTTP客户端**: axios
- **Twitter API**: twitter-api-v2
- **浏览器自动化**: playwright
- **代理支持**: socks-proxy-agent
- **部署平台**: Render

## 项目结构
```
multi-source-monitor/
├── src/
│   ├── index.js                    # 主程序入口
│   ├── orchestrator.js             # 监控编排器
│   ├── core/
│   │   ├── config.js              # 统一配置管理器
│   │   ├── database.js            # 统一数据库管理器
│   │   ├── schema-manager.js      # 数据库表结构管理器
│   │   ├── notifier.js            # 统一通知管理器
│   │   └── logger.js              # 统一日志管理器
│   ├── monitors/
│   │   ├── registry.js            # 监控模块注册表
│   │   ├── base/
│   │   │   └── BaseMonitor.js     # 监控基类
│   │   ├── twitter/
│   │   │   ├── TwitterMonitor.js          # Twitter监控器
│   │   │   ├── TwitterApiClient.js       # Twitter API客户端
│   │   │   ├── TwitterScheduler.js       # Twitter调度器
│   │   │   ├── TwitterAuthenticator.js   # Twitter认证工具
│   │   │   ├── schema.js                 # Twitter表结构
│   │   │   └── README.md                 # Twitter模块文档
│   │   ├── binance-announcement/
│   │   │   ├── BinanceAnnouncementMonitor.js # Binance公告监控器
│   │   │   ├── schema.js                 # Binance公告表结构
│   │   │   └── README.md                 # Binance公告模块文档
│   │   └── binance-price/
│   │       ├── BinancePriceMonitor.js    # Binance价格监控器
│   │       ├── schema.js                 # Binance价格表结构
│   │       └── README.md                 # Binance价格模块文档
│   └── services/
│       └── health.js              # 健康检查服务
├── tools/
│   └── authenticate.js            # Twitter认证工具
├── tests/
│   └── *.js                      # 测试文件
├── data/                         # 数据存储目录
├── .env                          # 环境变量配置
├── .env.example                  # 环境变量示例
├── package.json                  # 项目配置
├── README.md                     # 项目说明
└── TECHNICAL_DOCUMENTATION.md   # 技术文档
```

## 版本历史

### v4.0.0 (当前版本) - 模块化架构重构
- ✅ **模块分离** - Binance公告监控和价格监控独立为两个模块
- ✅ **模块内表管理** - 每个模块管理自己的数据库表结构
- ✅ **表结构管理器** - 统一的模块化表结构管理
- ✅ **三源监控支持** - Twitter + Binance公告 + Binance价格
- ✅ **独立配置** - 每个模块独立的环境变量配置
- ✅ **模块文档** - 每个模块独立的README文档
- ✅ **架构清晰** - 更清晰的模块职责分离

### v3.0.0 (历史版本) - 多源监控架构
- ✅ **多源监控支持** - Twitter + Binance双监控源
- ✅ **模块化架构** - 基于BaseMonitor的可扩展架构
- ✅ **统一编排器** - MonitorOrchestrator统一管理所有监控模块
- ✅ **实时WebSocket监控** - Binance公告实时推送
- ✅ **模块独立控制** - 可独立启用/禁用各监控模块
- ✅ **统一通知系统** - 支持多源消息格式化和推送
- ✅ **健康检查机制** - 自动监控模块健康状态和恢复
- ✅ **智能重连机制** - WebSocket和数据库自动重连

### v2.0.0 (历史版本) - Twitter单一监控
- ✅ 完全基于环境变量的配置管理
- ✅ 预先认证系统
- ✅ 智能时间调度算法
- ✅ 数据库持久化存储
- ✅ 环境分离支持
- ✅ Render部署支持

### v1.x.x (历史版本)
- 基于config.json的配置管理
- 简单的时间调度
- 文件存储系统

## 贡献指南

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 许可证

本项目采用MIT许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系方式

如有问题或建议，请通过以下方式联系：
- 创建Issue
- 发送邮件
- 项目讨论区

---

*最后更新: 2025年8月*

## 技术栈

### 核心技术
- **运行时**: Node.js 18+
- **数据库**: PostgreSQL (Supabase)
- **部署平台**: Render

### Twitter监控技术栈
- **API**: Twitter API v2
- **任务调度**: node-cron
- **浏览器自动化**: playwright
- **代理支持**: socks-proxy-agent

### Binance监控技术栈
- **API**: Binance WebSocket API
- **WebSocket客户端**: ws
- **签名算法**: HMAC SHA256
- **实时连接**: 24小时持久连接

### 通用技术
- **HTTP客户端**: axios
- **环境管理**: dotenv
- **日志系统**: 结构化日志
- **通知系统**: 钉钉Webhook