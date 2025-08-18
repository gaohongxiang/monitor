# 多源监控系统

🚀 基于Node.js的统一监控平台，支持多种监控源的模块化管理，统一钉钉通知推送。

## ✨ 核心特性

### 🎯 **多源监控支持**
- **Twitter官方API监控** - 定时轮询，多API凭证管理，智能时间调度，OAuth认证
- **Twitter OpenAPI监控** - 非官方API，Cookie认证，无调用限制，实时监控
- **Binance公告监控** - 实时WebSocket连接，公告推送监控
- **Binance价格监控** - 价格变化预警，支持多交易对监控

### 🔧 **模块化架构**
- **监控编排器** - 统一管理所有监控模块的生命周期
- **模块化设计** - 每个监控源独立实现，可单独启用/禁用
- **共享服务** - 统一的配置、数据库、通知、日志管理
- **模块内表管理** - 每个模块管理自己的数据库表结构

### 📱 **通知与存储**
- **钉钉通知集成** - 实时推送监控结果到钉钉群
- **数据库持久化** - 使用PostgreSQL存储状态和历史数据,自动初始化
- **去重机制** - 防止程序重启后重复推送
- **健康检查** - HTTP API提供系统状态监控

### 🌍 **部署与运维**
- **环境分离** - 支持开发和生产环境配置
- **优雅关闭** - 支持信号处理和资源清理
- **Render部署** - 支持一键部署到云平台

## 准备工作

只列出通用配置，各模块独有配置请参考各模块的README文档。

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

## 🚀 快速开始

### 1. 安装依赖
```bash
git clone https://github.com/gaohongxiang/monitor.git
cd monitor
npm install
```

### 2. 配置环境变量
```bash
# 复制并编辑环境变量文件
cp .env.example .env
```

编辑 .env 文件，用到哪个模块就配置哪个模块。 .env.example文件里有详细的说明，模块文档里有各模块的操作步骤。


### 4. 启动系统
```bash
# 开发环境启动
npm run dev

# 生产环境启动
npm start
```

### 5. 健康检查
```bash
# 检查系统状态
curl http://localhost:3000/health

# 查看详细状态
curl http://localhost:3000/status
```

## 🚀 Render部署

Railway不再提供免费版服务，推荐使用Render进行部署。

### 一键部署
1. **创建Render账户**
   - 访问 [Render官网](https://render.com) 并使用GitHub账户登录

2. **部署Web Service**
   - Dashboard → New → Web Service
   - 连接GitHub仓库，选择本项目
   - 配置基本信息
   - 在Environment页面添加所有必要的环境变量（可直接导入.env中的配置）

### 保活设置（重要）

Render免费版会在15分钟无活动后休眠，需要设置外部监控保持服务运行：

1. **注册UptimeRobot**
   - 访问 [uptimerobot.com](https://uptimerobot.com)
   - 免费账户支持50个监控

2. **添加监控**
   ```
   Monitor Type: HTTP(s)
   Friendly Name: Monitor System
   URL: https://your-app-name.onrender.com/health
   Monitoring Interval: 5 minutes
   ```

3. **验证部署**
   ```bash
   # 检查服务状态
   curl https://your-app-name.onrender.com/health

   # 查看详细状态
   curl https://your-app-name.onrender.com/status
   ```

### 免费版限制
- **运行时间**: 750小时/月（约31天）
- **内存**: 512MB RAM
- **休眠机制**: 15分钟无活动后休眠
- **解决方案**: 使用UptimeRobot保活监控

## 📚 文档结构

### 核心文档
- **[TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md)** - 详细技术架构和实现原理
- **[.env.example](.env.example)** - 环境变量配置示例

### 模块文档
- **[Twitter官方API监控](src/monitors/twitter/official/README.md)** - Twitter官方API监控模块详细说明
- **[Twitter OpenAPI监控](src/monitors/twitter/openapi/README.md)** - Twitter OpenAPI监控模块详细说明
- **[Binance公告监控](src/monitors/binance-announcement/README.md)** - Binance公告监控说明
- **[Binance价格监控](src/monitors/binance-price/README.md)** - Binance价格监控说明

### 外部文档
- [Binance WebSocket API](https://developers.binance.com/docs/zh-CN/cms/general-info)
- [Twitter API v2](https://developer.twitter.com/en/docs/twitter-api)
- [Render部署指南](https://render.com/docs)