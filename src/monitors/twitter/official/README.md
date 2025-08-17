# Twitter监控模块

🐦 监控指定Twitter用户的推文更新，支持多API凭证轮换使用。

## 功能说明

- 定时监控指定Twitter用户的推文
- 支持多个API凭证轮换，避免限流
- 自动去重，避免重复推送
- 推文更新时发送钉钉通知

Twitter API V2免费版限制严格：

项目限制：1个项目、1个应用程序、1个环境
请求限制：每月仅100次读取请求，平均每天3次
监控能力：基本只能监控1个用户，3个时间点各读取1次
多用户多时间点解决方案：系统支持多API凭证轮换，多API自己想办法

## 准备工作

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

### BitBrowser指纹浏览器

指纹浏览器我用的是比特指纹浏览器，如果你用的别的需要自己修改代码，这里主要是认证用的，不使用指纹浏览器也是可以的

- 导出数据，记下指纹浏览器id
- 将用于认证的twitter用户登录进去

### 代理

准备（买）socks5代理


## 配置

根据 .env.example的配置说明，开启twitter-official监控模块，将需要的配置信息填入。

## 使用方法

### 1. 认证API凭证

⚠️ **重要：认证前必须启动BitBrowser指纹浏览器！**

```bash
# 1. 检查刷新令牌状态
npm run twitter:official:refresh-token:check

# 2. 如果未认证，启动BitBrowser后进行认证
npm run twitter:official:refresh-token:auth
```

**认证步骤说明：**
1. 启动BitBrowser指纹浏览器
2. 运行 `npm run twitter:official:refresh-token:auth` 命令
3. 系统会自动打开浏览器进行OAuth认证
4. 完成认证后，refresh_token会自动保存到数据库
5. 后续系统会自动刷新访问令牌，无需重复认证


### 2. 启动监控
```bash
# 开发模式（立即开始测试）
npm run dev

# 生产模式（按配置时间执行）
npm start
```


## 相关链接

- [Twitter API v2文档](https://developer.twitter.com/en/docs/twitter-api)
- [X开发者平台](https://developer.x.com/en/portal/dashboard)
- [BitBrowser官网](https://www.bitbrowser.cn/)
