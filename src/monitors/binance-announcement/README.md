# Binance公告监控模块

📢 实时监控Binance官方公告，有新公告时发送钉钉通知。

## 功能说明

- 实时接收Binance公告推送
- 自动去重，避免重复推送
- 网络断开时自动重连
- 新公告发布时发送钉钉通知

## 准备工作

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

## 配置

根据 .env.example的配置说明，开启binence-announcement监控模块，将需要的配置信息填入。


## 使用方法

### 1. 启动监控
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 2. 钉钉通知示例

```
📢 公告：币安将上线PEPU解锁币 (PEPU)

📄 原文:
Binance Will List Pepe Unchained (PEPU)

🏷️ 分类: 新币上线
📅 发布时间: 2025-01-14 16:30:45
🔗 查看详情: https://www.binance.com/en/support/announcement
```

## 相关链接

- [Binance WebSocket API文档](https://developers.binance.com/docs/zh-CN/cms/general-info)
- [Binance API管理](https://www.binance.com/zh-CN/my/settings/api-management)
