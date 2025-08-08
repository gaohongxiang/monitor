# 多源监控系统

🚀 基于Node.js的统一监控平台，支持Twitter定时监控和Binance实时监控，统一钉钉通知推送。

## ✨ 核心特性

### 🎯 **多源监控支持**
- **Twitter监控** - 定时轮询，多API凭证管理，智能时间调度
- **Binance监控** - 实时WebSocket连接，公告推送监控

### 🔧 **统一架构**
- **监控编排器** - 统一管理所有监控模块的生命周期
- **模块化设计** - 每个监控源独立实现，可单独启用/禁用
- **共享服务** - 统一的配置、数据库、通知、日志管理

### 📱 **通知与存储**
- **钉钉通知集成** - 实时推送监控结果到钉钉群
- **数据库持久化** - 使用Supabase PostgreSQL存储状态和历史数据
- **健康检查** - HTTP API提供系统状态监控

### 🌍 **部署与运维**
- **环境分离** - 支持开发和生产环境配置
- **优雅关闭** - 支持信号处理和资源清理
- **Railway部署** - 支持一键部署到云平台

## 🤔 技术选型背景

### Twitter API限制与解决方案
Twitter API V2免费版限制严格：
- **项目限制**：1个项目、1个应用程序、1个环境
- **请求限制**：每月仅100次读取请求，平均每天3次
- **监控能力**：基本只能监控1个用户，3个时间点各读取1次

**多用户多时间点解决方案**：系统支持多API凭证轮换，多API自己想办法

### 托管平台选择
**需求**：7x24小时持续运行的监控服务

**对比方案**：
- **Railway** ✅ - 简单易用，自动部署
- **Render** - 功能类似，但数据库配置复杂
- **Cloudflare** - 主要面向静态站点，不适合长时间运行

**最终选择**：Railway
- 30天/$5试用期，成本可控
- 到期后可续费或想办法重新试用
- 一键部署，开发体验好

### 数据存储架构演进
**问题**：Twitter API每次请求会刷新token，需要持久化存储

**方案演进**：
1. **本地方案** - 存储在配置文件 ✅ 本地可行
2. **托管方案** - 文件系统只读 ❌ 无法写入
3. **数据库方案** - PostgreSQL存储 ✅ 完美解决
4. **按需重连** - PostgreSQL应该是有限制，闲置会断开连接。下个监控时间点自动重连
5. **Supabase** - railway的数据库，只提供试用，30天后会删除数据库。虽然可以重新创建，但是麻烦，改用supabase。

**技术收益**：
- Supabase提供稳定的PostgreSQL数据库服务
- 数据持久化，重启不丢失
- 支持多实例部署（未来扩展）

## 📋 环境要求

### 基础环境
- Node.js 18+
- 钉钉机器人访问令牌

### Twitter监控（可选）
- Supabase PostgreSQL数据库
- Twitter API v2凭证
- Bitbrowser指纹浏览器（认证用）

### Binance监控（可选）
- Binance API Key 和 Secret Key

### 部署平台
- Railway（推荐）或其他Node.js托管平台

## 🛠️ 准备工作

### 注册X开发者平台获取 Client ID 和 Client Secret

1. 访问 [X开发者平台](https://developer.x.com/en/portal/dashboard)
2. 使用你的 X 账号登录
3. 点击'Sign up for Free Account'注册免费账户
   - 描述 Twitter 数据和 API 的所有使用案例（根据[开发者政策支持](https://developer.x.com/en/support/x-api/policy#faq-developer-use-case)生成一个使用案例）
   - **示例使用案例**：*"开发一个社交媒体监控工具，用于跟踪特定Twitter账户的公开推文更新，以便及时了解重要信息动态。该工具仅读取公开推文内容，不涉及用户隐私数据，主要用于信息聚合和通知服务。"*

4. 填写项目基本信息：
   - **项目名称**：自定义一个名称（如：Twitter Monitor Tool）
   - **项目描述**：简单描述项目用途（如：监控Twitter用户推文更新）

5. 在项目设置中进行用户身份验证设置：
   - **应用程序权限选择**：读写和直接留言
   - **应用程序类型选择**：Web 应用程序、自动化应用程序或机器
   - **应用信息**：
     - 回调 URI/重定向 URL填写：`https://x.com/home`
     - 网站网址填写：`https://x.com`

6. 第五步填写完后跳转到OAuth 2.0页面，**记下OAuth 2.0的 Client ID 和 Client Secret**

### 创建Supabase数据库

**选择Supabase的优势**：
- ✅ **更稳定可靠** - 基于AWS基础设施，连接更稳定
- ✅ **免费额度充足** - 500MB存储，长期免费使用
- ✅ **管理界面友好** - 直观的数据库管理和监控工具
- ✅ **IPv4兼容** - 解决部署连接问题，支持所有平台

1. 访问 [Supabase官网](https://supabase.com/)
2. 点击 "Start your project" 或使用GitHub账号登录
3. 创建新项目：
   - 点击 "New project"
   - 填写项目信息（名称、数据库密码、区域）
   - 选择免费计划
   - 等待项目创建完成

4. 获取数据库连接信息：
   - 进入项目仪表板
   - 点击 Settings → Database
   - 在 Connection string 部分选择 "Transaction pooler"
   - 复制连接字符串并替换密码
   - 格式类似：`postgresql://postgres.xxx:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`

由于数据库里存的是同一个twitter用户的刷新令牌，所以开发环境和生产环境使用同一个数据库。

### 获取Binance API密钥

**如果启用Binance监控，需要获取API密钥**：

1. **登录Binance账户**：
   - 访问 [Binance官网](https://www.binance.com/)
   - 登录你的Binance账户

2. **创建API密钥**：
   - 进入 "API管理" 页面
   - 点击 "创建API"
   - 设置API名称（如：Monitor API）
   - **权限设置**：只需要 "读取" 权限（不需要交易权限）
   - 完成安全验证（邮箱、短信等）

3. **获取密钥信息**：
   - **API Key**：复制API密钥
   - **Secret Key**：复制密钥（只显示一次，请妥善保存）

4. **安全建议**：
   - 启用IP白名单（可选，但推荐）
   - 定期轮换API密钥
   - 只授予必要的最小权限

### 创建DeepL API密钥

**DeepL翻译用于将Binance公告等英文内容翻译为中文**：

1. **注册DeepL账户**：
   - 访问 [DeepL官网](https://www.deepl.com/pro-api)
   - 点击 "Sign up for free" 注册免费账户
   - 注意：注册需要添加信用卡信息，不支持中国。实测 `bybit card` 可以添加成功。

2. **创建API密钥**：
   - 登录后进入 [API管理页面](https://www.deepl.com/account/api)
   - 在 "Authentication Key for DeepL API" 部分
   - 复制显示的API密钥（格式类似：`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx`）

3. **免费版限制**：
   - **每月50万字符** - 对于监控系统来说完全够用
   - **翻译质量高** - 特别适合金融和技术术语翻译
   - **无需信用卡** - 注册即可使用

4. **配置说明**：
   - 免费版API密钥以 `:fx` 结尾
   - 付费版API密钥不带后缀
   - 系统会自动识别并使用对应的API服务器

### 创建钉钉机器人

1. **打开钉钉群聊**：
   - 进入需要接收通知的钉钉群
   - 如果没有合适的群，可以创建一个新群

2. **添加自定义机器人**：
   - 点击群设置（右上角齿轮图标）
   - 选择 "智能群助手"
   - 点击 "添加机器人"
   - 选择 "自定义" 机器人

3. **配置机器人**：
   - **机器人名字**：Twitter监控机器人（可自定义）
   - **安全设置**：选择 "自定义关键词"
   - **关键词**：填入 `Twitter` 或 `推文`（确保通知消息包含此关键词）
   - 勾选 "我已阅读并同意《自定义机器人服务及免责条款》"

4. **获取Webhook地址**：
   - 点击 "完成" 创建机器人
   - 复制生成的 **Webhook地址**
   - 格式类似：`https://oapi.dingtalk.com/robot/send?access_token=xxx`

5. **提取访问令牌**：
   - 从Webhook地址中提取 `access_token=` 后面的部分
   - 这就是 `DINGTALK_ACCESS_TOKEN` 的值


### BitBrowser指纹浏览器

指纹浏览器我用的是比特指纹浏览器，如果你用的别的需要自己修改代码，这里主要是认证用的，不使用指纹浏览器也是可以的

- 导出数据，记下指纹浏览器id
- 将用于认证的twitter用户登录进去

### 代理

准备（买）socks5代理

## 🚀 快速开始

### 1. 安装依赖
```bash
git clone https://github.com/gaohongxiang/monitor.git
cd montor
npm install
```

### 2. 配置环境变量
```bash
# 复制并编辑环境变量文件。示例文件有详细的说明
cp .env.example .env
```


### 3. 数据库初始化
数据库表结构会在系统首次启动时自动创建，无需手动迁移。

### 4. 认证API凭证（仅Twitter监控需要）
```bash
# 如果启用了Twitter监控，需要认证API凭证
npm run auth

# 检查认证状态
npm run auth:check
```

**注意**：
- **Twitter监控**：需要OAuth认证，使用指纹浏览器完成认证流程
- **Binance监控**：只需要API密钥，无需额外认证步骤

### 5. 启动系统
```bash
# 开发环境启动
npm run dev

# 生产环境启动
npm start
```

**启动后系统状态**：
- **Twitter监控**：定时轮询模式，按配置的时间点执行
- **Binance监控**：实时WebSocket连接，立即开始监控
- **健康检查**：`http://localhost:3000/health` 和 `/status`

## 🐳 Railway部署

### 1. 准备部署
1. 访问 [Railway官网](https://railway.app/)
2. 点击 "Start a New Project" 或 "Login" 
3. 使用GitHub账号登录（推荐）或注册新账号
4. 创建新项目：
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 连接你的GitHub仓库

### 3. 设置环境变量
在Railway控制台设置设置需要的环境变量即可

### 4.认证API凭证
由于开发和生产环境使用的同一个数据库，开发环境认证过了这里就不需要认证了。

### 5. 启动系统
系统会自动使用 `npm start` 启动生产模式。

## 📊 系统监控

### HTTP健康检查
```bash
# 健康状态
curl http://localhost:3000/health

# 详细状态（包含各模块状态）
curl http://localhost:3000/status
```

### 日志查看
- **系统日志**：控制台输出，包含所有模块的运行状态
- **Twitter数据**：`data/monitor/tweets/`（如果启用Twitter监控）
- **Binance数据**：实时处理，通过钉钉通知推送
- **监控统计**：存储在数据库中，可通过状态API查看

### 监控指标
- **Twitter监控**：API调用次数、成功率、限流状态
- **Binance监控**：WebSocket连接状态、心跳、接收消息数
- **通知系统**：钉钉消息发送成功率

## 🛠️ 常用命令

```bash
# 生产部署
npm start            # 生产模式启动

# 开发模式
npm run dev          # 开发模式启动（测试间隔1分钟）

# Twitter认证管理（仅Twitter监控需要）
npm run auth         # 认证所有Twitter凭证
npm run auth:check   # 检查Twitter认证状态
```

## 📚 更多文档

- 技术文档(详细的技术架构和实现原理): TECHNICAL_DOCUMENTATION.md
-binance WebSocket API文档: https://developers.binance.com/docs/zh-CN/cms/general-info#%E7%AD%BE%E5%90%8D