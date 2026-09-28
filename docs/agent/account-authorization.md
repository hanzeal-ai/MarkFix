# 指定账号的修复授权

## 目标与范围

修复方安装 CLI，输入目标邮箱；账号持有人登录桌面，在设置 → 修复授权核对申请码并显式选择项目，批准后原 CLI 自动继续。修复方不登录对方账号。通知使用账号内待审批列表和桌面轮询，不发送邮件。本轮风险 R2，用户授权实现、提交和推送 main；生产迁移与发布按目标环境门禁执行。

共享契约位于 packages/contracts，持久化位于 Prisma schema，现有 AgentGrant 和 AgentProjectService 继续裁决权限。新接口 GET /v1/agent/requests 使用普通账号会话认证；CLI Agent token 不能读取审批列表或批准请求。桌面仅暴露固定请求/审批/撤销 IPC，使用原有受信任 shell/settings sender 校验，目标网页无通用 IPC。

## 状态和身份

- POST /v1/agent/device 必须提供 account 邮箱，trim + lower-case 与账号系统一致。服务端解析并固化 targetUserId；不知道邮箱是否存在的调用者收到相同结构、10 分钟有效期和轮询行为。
- 不存在的账号和旧未绑定申请 targetUserId 为 null，任何账号均不能查看或审批，不能由后来注册的同名邮箱补领。
- 每 IP 10 次/10 分钟、每规范化邮箱哈希 5 次/10 分钟，复用现有限流服务；当前限流为进程内，多副本需在入口配置共享限流。
- inbox/preview/decision 都受目标账号限制。决策与令牌消费使用数据库事务和条件更新，只允许一次成功；批准没有默认全选，空项目不允许批准。
- AgentGrant 仍绑定批准账号和显式项目范围，每次业务操作再检查实时成员权限。账号持有人应与修复方核对申请码，设备名称为自述，不是已验证身份。
- CLI JSON 输出与 stderr 进度分离；未知账号不宣称已投递成功。已有授权和 --account 不一致时拒绝继续。

## 迁移与恢复

新增迁移 20260928000000_targeted_agent_requests：AgentDeviceRequest 新增可空 targetUserId 外键及 (targetUserId,status,expiresAt) 索引。保留现有用户、标注、授权、修复记录；旧未绑定 pending 无法在新 API 审批。新老客户端须协调升级：CLI 0.1.2 请求必须带 account，旧客户端发起新申请会被拒绝，已经签发的授权不受此字段影响。

发布先部署数据库增量迁移，再部署 API/桌面/CLI；不使用 db push。上线需单独的目标环境授权及备份。

优先前向修复。如需回滚 API，先暂停申请、审批和 token 消费入口，使所有 PENDING/APPROVED 未消费申请失效；再回滚应用。不能仅回滚到不检查 targetUserId 的旧 API，否则目标账号约束将丢失。新字段和索引可保留，不需要回删数据。已签发授权继续遵循原项目范围；如需撤销，按明确授权逐项处理。恢复入口后必须验证错误账号仍不能领取恢复前的申请。

CLI 退出默认阻止遗留待同步结果。用户明确执行 `markfix logout --archive-pending` 时，先撤销授权（失效授权允许本机清理），将 outbox 原子移动到 archived-results-UUID，输出路径后移除凭据。归档保留原 server/grantId，不自动补传到新授权；重新申请后需读取最新任务、领取并验证后再报告。

## 验证入口

使用 Node 24 和根 packageManager 的 pnpm：

```sh
pnpm --filter @markfix/api exec vitest run tests/agent-target-account.test.ts tests/service-config.test.ts
pnpm --filter @markfix/cli test
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

真实集成使用独立、可丢弃 PostgreSQL 数据库 markfix_agent_audit，仅允许 127.0.0.1：

```sh
# TEST_DATABASE_URL 指向隔离夹具，不能使用生产数据库。
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @markfix/database exec prisma migrate deploy
MARKFIX_DESKTOP_AGENT_SMOKE=true pnpm --filter @markfix/api exec tsx scripts/verify-agent-flow.ts
```

该流程启动真实 Nest API，CLI 为独立子进程，桌面为真实 Electron 与真实 shell IPC。使用临时测试账号、临时桌面 profile 和本机接口描述文件；系统钥匙串加密用测试替身，不接触真实凭据。覆盖账号申请、错误账号隔离、未知账号、审批、授权项目范围、令牌刷新/撤销，以及拉取、领取和修复回写。桌面审批截图写入测试输出目录。断言版本状态按当前 READY_FOR_VERIFY 契约执行。

生产迁移、生产账号跨设备、邮件投递和 Windows 实机不由本机证据代表。完整产品视觉审查不属于此次专项授权变更。

## 本次验证记录（2026-09-28）

基线 9e71d48，Node 24.14.0、pnpm 11.25.0。未新增生产依赖。

- 已验证：账号授权/来源校验聚焦测试 8 项；全项目测试通过，CLI 新增失效授权归档测试另行通过。format:check、lint、typecheck、build 通过。
- 已验证：隔离 PostgreSQL 真实 API + CLI + Electron 登录、待审批通知、项目默认不勾选、指定项目审批后 CLI 自动继续；随后拉取标注/截图、领取、失败重试、断网补传、待复验回写及撤销通过。
- 已验证：错误账号无法读取/审批申请，未知账号请求无法补领；同申请并发审批仅一个 201（另一个 409），并发交换令牌仅一个 201（另一个 401）；CLI 令牌访问 inbox/decision 返回 401。
- 已验证：增量迁移在隔离数据库成功；模拟既有 schema 后迁移，8 条既有申请与 1 份既有授权保持不变，旧请求 targetUserId 均为空；测试事务回滚恢复隔离夹具。
- 已验证：官网授权页真实 Electron 行为烟测覆盖项目选择、错误、批准、拒绝、自动关闭、窄屏及空项目；已目视桌面和网页授权截图。
- 已验证：独立目录解包 CLI 0.1.2，版本查询与离线 Skill 安装成功；无需仓库源码。
- 独立审查结论：接受本次代码交付。早期发现的失效授权退出死锁已通过显式归档恢复关闭，迁移回滚约束已补齐。
- 未验证：生产数据迁移、生产账号跨设备、系统钥匙串真实操作、正式分发和 Windows 实机。本机夹具不代表生产上线。

本机过程日志：`/tmp/markfix-account-{focused,tests,cli-final,archive,format,lint,typecheck,build,integration,concurrency,migration,web-smoke,pack}.log`。
