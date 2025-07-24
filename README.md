# Twitter多用户监控系统

🚀 基于Node.js的Twitter多用户监控系统，支持多API凭证轮换、智能时间调度和钉钉通知。

## ✨ 核心特性

- 🔄 **多API凭证轮换** - 智能管理多个Twitter API凭证，避免限流问题
- ⏰ **智能时间调度** - 根据环境和API数量自动分配监控时间点
- 🗄️ **数据库持久化** - 使用Supabase PostgreSQL存储认证信息和监控状态
- 🔐 **预先认证系统** - 独立的OAuth认证工具，支持批量认证
- 📱 **钉钉通知集成** - 实时推送新推文到钉钉群
- 🌍 **环境分离** - 支持开发和生产环境完全隔离
- 🚀 **Railway部署** - 支持部署到Railway平台

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

- Node.js 18+
- Supabase PostgreSQL数据库
- Twitter API v2凭证
- 钉钉机器人访问令牌
- Bitbrowser指纹浏览器
- Railway

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
# 复制并编辑环境变量文件
cp .env.example .env
```
将自己准备好的数据填入环境变量

### 3. 数据库迁移（如果是从旧版本升级）
```bash
# 执行数据库迁移（整合监控表）
npm run migrate

# 如果迁移出现问题，可以回滚
npm run migrate:rollback
```

### 4. 认证API凭证
```bash
# 认证所有配置的API凭证
npm run auth

# 检查认证状态
npm run auth:check
```

### 5. 启动系统
```bash
# 开发环境 - 立即开始测试，每1分钟执行一次
npm run dev
```

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
在Railway控制台设置：
```
API_CREDENTIALS=your_json_config
DATABASE_URL=Supabase PostgreSQL URL
DINGTALK_ACCESS_TOKEN=your_token
MONITOR_START_TIME=09:00
MONITOR_END_TIME=23:00
```
### 4.认证API凭证
由于开发和生产环境使用的同一个数据库，开发环境认证过了这里就不需要认证了。

### 5. 启动系统
系统会自动使用 `npm start` 启动生产模式。

## 📊 系统监控

### HTTP健康检查
```bash
# 健康状态
curl http://localhost:3000/health

# 详细状态
curl http://localhost:3000/status
```

### 日志查看
- 系统日志：控制台输出
- 推文数据：`data/monitor/tweets/`
- 监控统计：存储在数据库中

## 🛠️ 常用命令

```bash
# 开发和测试
npm run dev          # 开发模式启动
npm run test         # 运行系统测试
npm run verify       # 验证部署

# 认证管理
npm run auth         # 认证所有凭证
npm run auth:check   # 检查认证状态

# 数据库管理
npm run migrate      # 执行数据库迁移
npm run migrate:rollback # 回滚数据库迁移

# 生产部署
npm start            # 生产模式启动
```

## 📚 更多文档

- [技术文档](TECHNICAL_DOCUMENTATION.md) - 详细的技术架构和实现原理