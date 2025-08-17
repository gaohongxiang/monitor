# Twitter OpenAPI监控模块

🐦 使用非官方Twitter OpenAPI监控指定用户的推文更新，支持获取推文内容和用户信息。

## 功能说明

- 实时监控指定Twitter用户的推文内容
- 获取用户基本信息（关注者数量、资料变化等）
- 自动Cookie管理和刷新机制
- Cookie失效时自动通知和停止
- 支持代理配置提高连接稳定性
- 推文更新时发送钉钉通知

**相比官方API的优势：**
- 无API调用次数限制
- 可以获取完整推文内容
- 不需要复杂的OAuth认证流程

**风险提醒：**
- 使用非官方API可能违反Twitter服务条款
- 账号可能面临被限制的风险
- Twitter随时可能改变内部API导致失效

## 准备工作

### 获取Twitter Cookie

1. **准备Twitter账号**
   - 建议使用专门的小号（避免主账号风险）
   - 确保账号状态正常，未被限制

2. **获取认证Cookie**
   - 登录 [Twitter/X](https://x.com)
   - 按F12打开开发者工具
   - 进入 `Application` 标签页
   - 左侧选择 `Storage` -> `Cookies` -> `https://x.com`
   - 找到并复制以下Cookie值：
     - `auth_token`: 长期认证令牌（30-90天有效）
     - `ct0`: CSRF令牌（24小时有效，会自动刷新）

## 配置

根据 .env.example的配置说明，开启twitter-openapi监控模块，将需要的配置信息填入。


## 使用方法

### 1. 配置Cookie

使用凭证管理脚本添加Cookie：

```bash
# 启动凭证管理器
npm run twitter:openapi:credentials

# 选择 "1. 添加/更新用户凭证"
# 按提示输入：
# - 用户名：提供Cookie的Twitter用户名（如：your_cookie_account）
# - Auth Token：从浏览器获取的auth_token
# - CT0 Token：从浏览器获取的ct0令牌
```

>系统会自动选择最佳的Cookie用户

### 2. 启动监控

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 3. 监控Cookie状态

系统会自动进行以下操作：
- **健康检查**: 每2小时检查Cookie有效性
- **定期提醒**: 每2周提醒检查Cookie状态
- **自动刷新**: ct0令牌会自动更新
- **故障通知**: Cookie失效时发送钉钉通知并停止模块

## Cookie管理机制

### 自动管理
- ✅ **ct0自动刷新**: 系统自动维护CSRF令牌
- ✅ **健康检查**: 定期验证Cookie有效性
- ✅ **故障检测**: 自动检测Cookie失效
- ✅ **通知机制**: 失效时发送详细通知

### 手动维护
- 🔄 **auth_token更新**: 通常30-90天需要手动更新
- 📅 **定期检查**: 建议每月检查一次状态
- 🔧 **故障恢复**: 根据通知提示更新Cookie

### Cookie失效处理

当Cookie失效时，系统会：
1. 发送钉钉通知说明失效原因
2. 自动停止模块避免无效请求
3. 提供详细的解决方案

**解决步骤：**
1. 重新登录Twitter获取新Cookie
2. 使用凭证管理脚本更新Cookie：`npm run twitter:openapi:credentials`
3. 重启监控系统

## 注意事项

### 安全建议
- 🔒 使用专门的Twitter小号
- 🌐 配置代理提高连接稳定性
- 📊 控制请求频率避免被检测
- 🔄 定期更新Cookie保持有效性

### 风险控制
- ⚖️ 了解并接受使用非官方API的风险
- 🚫 避免频繁请求导致账号被限制
- 📋 准备备用方案（如官方API）
- 🔍 监控账号状态变化

### 最佳实践
- 🧪 先在测试环境验证功能
- 📈 小规模部署，逐步扩展
- 📊 监控系统运行状态
- 🔄 建立定期维护流程

## 故障排除

### 常见问题

**初始化失败**
- 检查Cookie配置是否正确
- 验证Twitter账号状态
- 确认网络连接正常

**Cookie验证失败**
- 重新获取最新Cookie
- 检查账号是否被限制
- 尝试更换IP地址

**推文获取失败**
- 确认用户名拼写正确
- 检查用户是否为受保护账号
- 验证Cookie是否仍然有效

## 相关链接

- [Twitter OpenAPI TypeScript库](https://github.com/fa0311/twitter-openapi-typescript)
- [Twitter官方网站](https://x.com)
- [开发者工具使用指南](https://developer.chrome.com/docs/devtools/)

---

**免责声明**: 此模块仅供学习和研究使用，使用者需自行承担相关风险并遵守相关法律法规。
