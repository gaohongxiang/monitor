# Requirements Document

## Introduction

本项目是一个Twitter多用户监控系统，支持多API凭证管理、智能时间调度、推文获取和钉钉通知功能。系统采用环境变量+数据库的混合架构，实现敏感数据安全存储、动态数据持久化，并支持开发和生产环境分离。系统将部署在Railway平台，使用自动容器化和托管数据库服务。

## Requirements

### Requirement 1 - 多用户Twitter监控

**User Story:** 作为运营人员，我希望系统能够监控多个Twitter用户的最新推文，这样我可以及时了解重要账号的动态。

#### Acceptance Criteria

1. WHEN 系统运行 THEN 系统SHALL监控配置文件中指定的所有Twitter用户
2. WHEN 用户发布新推文 THEN 系统SHALL在下次检查时获取到新推文
3. WHEN 获取推文成功 THEN 系统SHALL保存推文内容、时间、链接和互动数据
4. WHEN 推文内容超过280字符 THEN 系统SHALL获取完整的长推文内容

### Requirement 2 - 智能时间调度

**User Story:** 作为系统管理员，我希望系统能够根据API凭证数量智能分配监控时间，这样可以最大化利用API配额。

#### Acceptance Criteria

1. WHEN 生产环境运行 THEN 系统SHALL在配置的开始和结束时间各执行一次监控
2. WHEN 生产环境有多个API凭证 THEN 系统SHALL根据API凭证数量在开始和结束时间之间均匀分配额外的监控时间点
3. WHEN 开发环境运行 THEN 系统SHALL从当前时间开始，按配置的测试间隔执行监控
4. WHEN 到达调度时间 THEN 系统SHALL自动触发对应用户的监控任务

### Requirement 3 - API凭证轮换和限流处理

**User Story:** 作为开发者，我希望系统能够智能管理多个API凭证，避免单个凭证的限流问题。

#### Acceptance Criteria

1. WHEN API调用遇到429限流错误 THEN 系统SHALL自动轮换到下一个可用凭证
2. WHEN 所有凭证都遇到限流 THEN 系统SHALL等待重置时间后重试
3. WHEN API凭证认证失败 THEN 系统SHALL记录错误并跳过该凭证
4. WHEN 系统重启 THEN 系统SHALL从数据库恢复最新的refreshToken

### Requirement 4 - 钉钉通知集成

**User Story:** 作为运营人员，我希望在发现新推文时能够及时收到钉钉通知，这样可以快速响应重要信息。

#### Acceptance Criteria

1. WHEN 发现新推文 THEN 系统SHALL发送钉钉通知消息
2. WHEN 单条新推文 THEN 通知SHALL包含用户名、推文内容、时间和链接
3. WHEN 多条新推文 THEN 通知SHALL汇总显示推文数量和摘要
4. WHEN 钉钉通知发送失败 THEN 系统SHALL重试最多3次

### Requirement 5 - 环境变量配置管理

**User Story:** 作为开发者，我希望敏感数据（如访问令牌）存储在环境变量中，这样可以确保敏感信息不会被提交到代码仓库，提高系统安全性。

#### Acceptance Criteria

1. WHEN 系统启动 THEN 系统SHALL从环境变量读取钉钉访问令牌
2. WHEN 敏感配置缺失 THEN 系统SHALL显示明确的错误信息并停止启动
3. WHEN 代码提交到仓库 THEN 敏感数据SHALL不会被包含在代码中

### Requirement 6 - API凭证JSON配置

**User Story:** 作为开发者，我希望API凭证配置使用JSON格式存储在环境变量中，这样可以保持配置结构的清晰性，同时确保敏感信息的安全。

#### Acceptance Criteria

1. WHEN 系统读取API凭证 THEN 系统SHALL从环境变量中解析JSON格式的凭证配置
2. WHEN JSON格式错误 THEN 系统SHALL显示详细的解析错误信息
3. WHEN 需要添加新的API凭证 THEN 开发者SHALL能够通过修改环境变量中的JSON配置来添加
4. WHEN 系统初始化 THEN 系统SHALL验证所有必需的凭证字段都存在

### Requirement 15 - 优化API凭证配置结构

**User Story:** 作为开发者，我希望API凭证配置采用按监控用户分组的嵌套结构，这样可以减少配置冗余，提高配置的可读性和维护性。

**背景:** 当前的平铺结构需要为每个API凭证重复写monitorUser等信息，造成配置冗余。新的嵌套结构按监控用户分组，每个用户下包含多个API凭证，配置更简洁清晰。

#### Acceptance Criteria

1. WHEN 配置API凭证 THEN 开发者SHALL能够使用按monitorUser分组的嵌套JSON结构
2. WHEN 同一监控用户有多个API凭证 THEN 所有凭证SHALL在同一个用户对象的credentials数组中
3. WHEN 系统解析配置 THEN 系统SHALL支持新的嵌套结构格式
4. WHEN 配置验证 THEN 系统SHALL验证嵌套结构的完整性和正确性
5. WHEN 多个API凭证轮换 THEN 系统SHALL按用户分组进行凭证轮换
6. WHEN 配置错误 THEN 系统SHALL提供针对嵌套结构的详细错误信息

### Requirement 7 - 数据库持久化存储

**User Story:** 作为开发者，我希望动态更新的数据（如refreshToken）存储在PostgreSQL数据库中，这样可以确保数据持久化和实时更新。

#### Acceptance Criteria

1. WHEN API调用返回新的refreshToken THEN 系统SHALL将新token保存到数据库
2. WHEN 系统重启 THEN 系统SHALL从数据库读取最新的refreshToken
3. WHEN 数据库连接失败 THEN 系统SHALL显示错误信息并尝试重连
4. WHEN 保存token失败 THEN 系统SHALL记录错误日志但不中断监控服务

### Requirement 8 - 环境分离

**User Story:** 作为开发者，我希望开发和生产环境使用分离的数据库，这样可以确保本地测试不会影响生产数据，同时保持环境隔离。

#### Acceptance Criteria

1. WHEN 在开发环境运行 THEN 系统SHALL连接到开发专用数据库
2. WHEN 在生产环境运行 THEN 系统SHALL连接到生产专用数据库
3. WHEN 开发环境数据变更 THEN 生产环境数据SHALL不受影响
4. WHEN 切换环境 THEN 系统SHALL自动使用对应环境的数据库连接

### Requirement 9 - Railway自动化部署

**User Story:** 作为开发者，我希望系统能够在Railway平台上自动容器化部署，这样可以简化部署流程，无需维护复杂的Docker配置。

#### Acceptance Criteria

1. WHEN 代码推送到仓库 THEN Railway SHALL自动检测并容器化应用
2. WHEN 部署完成 THEN 系统SHALL能够正常启动并连接到数据库
3. WHEN 环境变量更新 THEN 系统SHALL在重启后使用新的配置
4. WHEN 部署失败 THEN Railway SHALL提供详细的错误日志

### Requirement 10 - 预先手动认证系统

**User Story:** 作为开发者，我希望在系统正式运行前能够预先完成所有API凭证的OAuth认证，这样可以确保系统部署后立即可用，避免在服务器环境中进行复杂的浏览器认证操作。

#### Acceptance Criteria

1. WHEN 运行认证工具 THEN 系统SHALL提供独立的认证命令行工具
2. WHEN 执行认证命令 THEN 工具SHALL自动连接数据库并初始化必要的表结构
3. WHEN 数据库表不存在 THEN 认证工具SHALL自动创建所有必需的数据库表
4. WHEN 开始认证流程 THEN 工具SHALL读取环境变量中的API凭证配置
5. WHEN 进行OAuth认证 THEN 工具SHALL为每个凭证启动浏览器完成认证流程
6. WHEN 认证成功 THEN 工具SHALL将refreshToken保存到数据库的refresh_tokens表
7. WHEN 认证失败 THEN 工具SHALL显示详细错误信息并允许重试
8. WHEN 检查认证状态 THEN 工具SHALL显示每个凭证的认证状态和过期时间
9. WHEN 部分凭证已认证 THEN 工具SHALL支持增量认证未认证的凭证
10. WHEN 认证完成 THEN 主系统启动时SHALL直接使用数据库中的refreshToken

### Requirement 11 - 认证工具命令行接口

**User Story:** 作为开发者，我希望认证工具提供友好的命令行接口，这样可以方便地管理不同环境下的API凭证认证。

#### Acceptance Criteria

1. WHEN 执行npm run auth THEN 工具SHALL认证所有配置的API凭证
2. WHEN 执行npm run auth:check THEN 工具SHALL显示所有凭证的认证状态报告
3. WHEN 执行npm run auth:user <nickname> THEN 工具SHALL只认证指定用户的凭证
4. WHEN 执行npm run auth:reset THEN 工具SHALL清空现有认证并重新认证所有凭证
5. WHEN 认证过程中 THEN 工具SHALL显示进度条和状态信息
6. WHEN 认证完成 THEN 工具SHALL显示认证结果摘要
7. WHEN 发生错误 THEN 工具SHALL提供清晰的错误信息和解决建议

### Requirement 12 - 配置验证和错误处理

**User Story:** 作为开发者，我希望系统提供清晰的配置验证和错误提示，这样可以快速定位和解决配置问题。

#### Acceptance Criteria

1. WHEN 配置验证失败 THEN 系统SHALL显示具体的错误字段和期望格式
2. WHEN 数据库连接测试 THEN 系统SHALL在启动时验证数据库连接
3. WHEN API凭证验证 THEN 系统SHALL在启动时测试API凭证的有效性
4. WHEN 配置完整性检查 THEN 系统SHALL验证所有必需配置项都已设置

### Requirement 13 - 数据库连接稳定性

**User Story:** 作为系统管理员，我希望系统能够自动处理数据库连接断开的情况，这样可以确保监控服务的持续稳定运行。

**背景:** Railway免费版PostgreSQL服务可能存在连接时间限制，空闲连接在5分钟左右会被自动断开以节省资源。传统的定时保活方案会增加数据库负载且仍可能遇到断开问题，因此采用按需重连机制，只在监控任务执行时检查和重连数据库，既减少资源消耗又确保连接可用性。

#### Acceptance Criteria

1. WHEN 数据库连接断开 THEN 系统SHALL不会因此崩溃或停止运行
2. WHEN 监控任务执行前 THEN 系统SHALL检查数据库连接状态
3. WHEN 数据库连接不可用 THEN 系统SHALL自动尝试重新连接
4. WHEN 数据库重连失败 THEN 系统SHALL跳过本次监控任务，等待下次重试
5. WHEN 数据库重连成功 THEN 系统SHALL继续正常执行监控任务
6. WHEN 数据库连接错误 THEN 系统SHALL区分连接错误和其他严重错误
7. WHEN 发生连接错误 THEN 系统SHALL记录详细的错误信息用于诊断
8. WHEN 系统运行期间 THEN 系统SHALL采用按需重连而非定时保活机制

### Requirement 14 - 时区显示优化和用户体验

**User Story:** 作为中国用户，我希望系统显示的时间都是北京时间（UTC+8），这样更直观易懂，但系统内部计算仍使用UTC确保准确性。

**背景:** 系统面向中国用户，但部署在国际云平台上。为确保时间计算的准确性，系统内部统一使用UTC时间进行所有计算和存储，但为了用户体验，所有面向用户的时间显示都转换为北京时间（UTC+8）。

#### Acceptance Criteria

1. WHEN 用户配置监控时间 THEN 用户SHALL能够直接输入北京时间（UTC+8）格式
2. WHEN 系统显示触发时间 THEN 系统SHALL显示北京时间而不是UTC时间
3. WHEN 发送钉钉通知 THEN 推文时间和推送时间SHALL显示北京时间
4. WHEN 系统打印状态报告 THEN 系统SHALL显示距离下次触发还有多长时间
5. WHEN 系统内部进行时间计算 THEN 系统SHALL使用UTC时间确保准确性
6. WHEN 环境变量配置时间 THEN 用户SHALL能够在.env文件中直接输入北京时间（UTC+8）
7. WHEN 配置MONITOR_START_TIME和MONITOR_END_TIME THEN 用户SHALL输入北京时间格式，系统自动转换为UTC
8. WHEN 数据库存储时间 THEN 系统SHALL以UTC格式存储所有时间戳
9. WHEN API调用涉及时间参数 THEN 系统SHALL使用UTC时间进行API调用