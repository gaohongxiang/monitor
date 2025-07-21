# Implementation Plan

## 核心功能实现

- [x] 1. 设置项目基础结构和依赖
  - 创建基本的Node.js项目结构
  - 安装必要的依赖包：twitter-api-v2, node-cron, pg等
  - 设置package.json启动脚本
  - _Requirements: 9.1_

- [x] 2. 实现Twitter API客户端 (XClient)
  - [x] 2.1 创建XClient基础类
    - 实现Twitter API v2客户端初始化
    - 实现OAuth2认证和token刷新机制
    - 添加代理支持和错误处理
    - _Requirements: 3.1, 3.2_

  - [x] 2.2 实现推文获取功能
    - 实现getUserTweets方法，支持since_id参数
    - 支持长推文完整文本获取（note_tweet字段）
    - 实现单次请求获取，限制在10条推文以内
    - 添加API限流处理和重试机制
    - _Requirements: 1.1, 1.4, 3.1, 3.2_

- [x] 3. 实现XAuthenticator认证工具
  - 集成指纹浏览器进行OAuth2认证
  - 实现自动化认证流程
  - 支持多个API凭证的批量认证
  - _Requirements: 3.3_

- [x] 4. 创建配置管理系统 (ConfigManager)
  - [x] 4.1 实现环境变量配置读取
    - 从环境变量读取所有配置信息
    - 实现JSON格式API凭证解析功能
    - 添加配置验证和错误处理
    - _Requirements: 5.1, 6.1, 6.2, 11.1_

  - [x] 4.2 实现配置验证功能
    - 验证所有必需的配置项都存在
    - 验证API凭证格式的完整性
    - 提供详细的错误提示信息
    - _Requirements: 6.4, 11.1, 11.4_

- [x] 5. 创建数据库管理模块 (DatabaseManager)
  - [x] 5.1 实现PostgreSQL连接管理
    - 创建 `src/database.js` 文件，实现PostgreSQL连接和基础操作
    - 实现数据库连接池管理和错误处理
    - 支持开发和生产环境的数据库分离
    - _Requirements: 7.3, 8.1, 8.2_

  - [x] 5.2 创建数据库表结构
    - 定义 refresh_tokens、monitor_state、api_usage_stats 表结构
    - 实现表创建的SQL脚本和自动初始化功能
    - 添加索引和约束优化查询性能
    - _Requirements: 7.1, 7.2_

- [x] 6. 实现时间调度管理器 (ScheduleManager)
  - [x] 6.1 实现智能时间计算算法
    - 实现生产环境固定开始结束时间的调度算法
    - 实现开发环境从当前北京时间开始的调度算法
    - 根据API凭证数量智能分配监控时间点
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 6.2 创建定时任务管理
    - 使用node-cron创建和管理定时任务
    - 支持任务的启动、停止和状态查询
    - 实现任务执行的错误处理和重试机制
    - _Requirements: 2.4_

- [x] 7. 实现监控管理器 (MonitorManager)
  - [x] 7.1 创建核心监控逻辑
    - 实现多用户Twitter监控功能
    - 集成XClient进行推文获取
    - 实现API凭证轮换和限流处理
    - _Requirements: 1.1, 1.2, 3.1, 3.2_

  - [x] 7.2 实现数据存储和状态管理
    - 将refreshToken存储到数据库而不是文件
    - 实现监控状态（last_tweet_id）的数据库存储
    - 实现监控统计数据的收集和存储
    - _Requirements: 7.1, 7.2, 7.4_

  - [x] 7.3 集成钉钉通知功能
    - 实现新推文的钉钉通知发送
    - 支持单条和多条推文的通知格式
    - 添加通知发送失败的重试机制
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 8. 创建主程序入口 (index.js)
  - 实现系统启动和初始化流程
  - 集成所有管理器模块
  - 实现优雅关闭和错误处理
  - 添加HTTP健康检查端点
  - _Requirements: 9.2, 11.2_

## 架构升级和优化

- [x] 9. 重构refreshToken管理
  - [x] 9.1 实现数据库token存储
    - 修改 `src/x.js` 中的token管理逻辑
    - 集成数据库token读取和更新功能
    - 添加token更新失败的错误处理
    - _Requirements: 7.1, 7.2, 7.4_

  - [x] 9.2 更新ConfigManager集成
    - 移除config.json依赖，完全使用环境变量
    - 实现数据库连接配置的环境变量读取
    - 保持API调用的向后兼容性
    - _Requirements: 5.1, 6.1_

- [x] 10. 实现环境分离功能
  - [x] 10.1 添加环境检测逻辑
    - 实现开发和生产环境的自动检测
    - 根据环境变量选择不同的数据库连接
    - 实现环境特定的配置加载
    - _Requirements: 8.1, 8.2, 8.4_

  - [x] 10.2 确保环境隔离
    - 验证开发环境数据不会影响生产环境
    - 实现环境特定的日志和错误处理
    - 添加环境标识到系统状态报告中
    - _Requirements: 8.3, 8.4_

- [x] 11. 更新时间调度算法
  - [x] 11.1 实现环境感知的时间计算
    - 修改 `src/scheduler.js` 中的时间计算逻辑
    - 实现生产环境固定开始结束时间的调度
    - 实现开发环境从当前时间开始的调度
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 11.2 集成北京时间处理
    - 确保所有时间计算都使用北京时间
    - 更新日志输出显示正确的时间信息
    - 测试跨时区的时间计算准确性
    - _Requirements: 2.3, 2.4_

- [x] 12. 更新监控状态管理
  - [x] 12.1 实现数据库状态存储
    - 修改 `src/monitor.js`，将监控状态保存到数据库
    - 实现last_tweet_id的数据库存储和读取
    - 更新监控统计数据的数据库存储
    - _Requirements: 7.1, 7.2_

  - [x] 12.2 集成数据库错误处理
    - 添加数据库操作失败时的fallback机制
    - 实现数据库重连逻辑
    - 确保数据库错误不会中断监控服务
    - _Requirements: 7.3, 7.4_

## 预先手动认证系统

- [x] 13. 创建预先认证工具
  - [x] 13.1 创建认证工具脚本
    - 创建 `tools/authenticate.js` 独立认证工具
    - 集成现有的 XAuthenticator 进行 OAuth 认证
    - 实现数据库连接和表结构自动初始化
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 13.2 实现批量认证功能
    - 读取环境变量中的 API_CREDENTIALS 配置
    - 逐个调用 XAuthenticator 完成 OAuth 认证
    - 将获得的 refreshToken 保存到数据库
    - _Requirements: 10.4, 10.5, 10.6_

- [x] 14. 添加npm脚本和状态检查
  - [x] 14.1 创建认证命令
    - 添加 `npm run auth` 命令到 package.json
    - 实现简单的控制台输出显示认证进度
    - 添加基本的错误处理和重试逻辑
    - _Requirements: 11.1, 11.6_

  - [x] 14.2 实现状态检查功能
    - 添加 `npm run auth:check` 命令
    - 查询数据库显示所有凭证的认证状态
    - 显示认证时间和有效性信息
    - _Requirements: 11.2, 10.8_

- [x] 15. 更新主系统集成
  - [x] 15.1 修改监控系统认证逻辑
    - 更新 `src/monitor.js` 中的 createClientForUser 方法
    - 优先从数据库读取 refreshToken
    - 移除自动 OAuth 认证逻辑
    - _Requirements: 10.10_

  - [x] 15.2 添加启动时认证检查
    - 在系统启动时检查数据库中的认证状态
    - 显示未认证凭证的警告信息
    - 提供认证工具使用提示
    - _Requirements: 10.8, 10.10_

## 系统测试和部署准备

- [x] 16. Railway部署支持
  - 确保package.json包含正确的启动脚本
  - 添加HTTP健康检查端点和系统状态监控
  - 验证系统支持Railway的自动容器化
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 17. 系统测试验证
  - 测试开发和生产模式的时间调度功能
  - 验证完整监控流程：配置→调度→监控→通知
  - 测试API凭证轮换和数据库存储功能
  - _Requirements: 1.1, 2.1, 2.3, 3.1, 7.2_

- [x] 18. 部署文档准备
  - 更新DEPLOYMENT.md包含认证步骤和部署清单
  - 创建认证工具使用指南和故障排除文档
  - _Requirements: 11.7, 10.10_

## 数据库连接优化

- [x] 19. 实现按需重连机制

  - [x] 19.1 实现智能连接检查
    - 创建 `ensureConnection()` 方法进行按需连接检查
    - 每次监控任务执行前检查数据库连接状态
    - 快速测试连接可用性，断开时自动重连
    - _Requirements: 7.3, 7.4_

  - [x] 19.2 优化异常处理机制
    - 区分数据库连接错误和其他严重错误
    - 连接错误不导致程序退出，等待重连机制处理
    - 其他严重错误才触发优雅关闭
    - _Requirements: 7.3, 7.4_

  - [x] 19.3 集成监控流程
    - 在 `scheduledMonitorUser()` 方法中集成连接检查
    - 监控任务触发时首先确保数据库连接可用
    - 连接不可用时跳过本次监控，等待下次重试
    - _Requirements: 7.3, 7.4_

## 时区显示优化

- [x] 20. 实现时区处理工具类
  - [x] 20.1 创建TimeUtils工具类
    - 创建 `src/timeUtils.js` 文件，统一处理时区转换
    - 实现UTC时间转换为UTC+8显示功能
    - 实现下次执行倒计时计算功能
    - 实现环境变量时间转换（UTC+8输入→UTC内部处理）
    - _Requirements: 14.1, 14.6, 14.7_

  - [x] 20.2 优化配置管理器时区处理
    - 修改ConfigManager支持UTC+8时间输入
    - 用户输入北京时间，系统自动转换为UTC
    - 更新环境变量说明，明确时间格式为北京时间
    - _Requirements: 14.1, 14.6_

  - [x] 20.3 优化系统显示时间
    - 修改调度器触发时间显示为UTC+8
    - 修改系统状态报告显示UTC+8时间
    - 添加下次触发倒计时功能
    - 修改钉钉通知时间显示为UTC+8
    - _Requirements: 14.2, 14.3, 14.4_