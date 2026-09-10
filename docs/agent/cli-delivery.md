# 项目权限与 CLI 接入交付记录

## 当前契约

风险 R2：公开接口、委托授权、项目权限、数据归属和标注状态变更。
用户已授权实现、移除工作区和逐任务本地提交；未授权推送、发布、部署或迁移现有数据库。

- 工作区业务模型、接口、字段和选择器全部移除。项目直接归属用户，协作使用项目成员和项目角色。
- `packages/contracts` 定义共享接口；Prisma schema 定义服务端持久化；`authorization.ts` 定义修复权限。
- CLI 使用浏览器设备授权，用户选择允许访问的项目。每次请求仍检查实时项目成员权限；令牌不能用于普通账号接口。
- 首次服务命令自动发起浏览器授权，批准后继续原命令；首次授权注册当前 Git 项目，Codex Skill 在后续仓库会话中自动注册当前项目。只上传名称和随机标识，不上传本地目录、代码或会话内容。
- 桌面端与后台可选择已上报仓库。手动输入名称保存为待绑定信息；为避免同名误匹配，只有确认具体上报记录后才自动解析项目。没有唯一绑定时由会话选择。
- 当前仅支持 Codex，通过 `agentType` 和独立 Skill 保留其他 Agent 接入位置，不包含 MCP 或旧接口适配。
- LOCAL 项目通过桌面本机接口使用 CLI（--local），独立浏览器项目授权、仓库绑定与结果回写；CLOUD 继续通过服务端权限契约。两者不互传数据。
- Report 是状态真相：OPEN → IN_PROGRESS → RESOLVED / FIX_FAILED。后台将 RESOLVED 展示为“已完成”；失败详情显示原因与阶段，历史尝试保留用于追溯。
- 领取采用行锁和版本检查；15 分钟租约可续期。版本变化拒绝旧结果，释放后可显式重试中断任务。失败重试需要明确 `--retry`。
- 成功必须提供实际通过的检查记录。结果写入本地 outbox 后上传；断网重传和重复完成具有幂等语义。服务器确认前不能报告完成。
- macOS 默认钥匙串；其他平台须显式选择权限受限的文件存储。授权有效期 30 天，访问令牌 15 分钟，刷新令牌轮换；可从网页撤销。

## 安装与运行

使用 Node 24 和根 packageManager 指定的 pnpm。CLI 没有新增生产依赖。
从本次源码打包：

```sh
pnpm --filter @markfix/cli pack --pack-destination /tmp/markfix-cli-package
npm install -g /tmp/markfix-cli-package/markfix-cli-0.1.0.tgz
cd /path/to/repository
markfix projects list --server https://your-markfix-server
```

包包含 Codex Skill，首次授权后安装。安装、帮助和版本查询不授权。此命令说明不代表已经公开发布安装包或部署服务。
项目选择、领取、验证与结果 JSON 见 `apps/cli/skills/markfix/SKILL.md` 和 CLI README。

## 数据迁移与恢复

`20260909000000_project_members` 是一次性历史数据迁移，不是运行时兼容层。
它将工作区成员映射到其项目，将套餐移到所有者账号，保留角色、成员状态与邀请，删除旧模型。
没有有效所有者、或者邀请无法唯一确定目标项目时整笔事务失败，禁止猜测目标项目。
`20260909010000_agent_cli` 增加 Agent 授权、仓库、修复尝试和失败状态。

已在独立本地 PostgreSQL 数据库验证：一个工作区的两个成员映射到两个项目，得到四条正确成员记录；
含歧义邀请的迁移被拒绝，事务回滚后原来的工作区、项目、成员、邀请数量不变。
未迁移现有应用数据库。

目标环境执行前需要单独批准、完整备份与恢复演练，并停止旧客户端/服务写入。
本次没有旧接口兼容，必须协调更新 API、桌面与网页客户端。
迁移失败依靠事务回滚；提交后需恢复完整备份和匹配的旧构建，或编写经批准的前向修复。
不可直接降级应用连接新 schema，也不可删除已有修复历史。新数据产生后优先前向修复；
若必须恢复备份，先导出变更期间数据并制定重放方案。

## 验证与限制

已执行全仓 format:check、lint、typecheck、test、build。
可复现的真实数据库检查只允许独立的本地 `markfix_agent_audit` 数据库：

```sh
TEST_DATABASE_URL=postgresql://markfix:markfix@127.0.0.1:5432/markfix_agent_audit pnpm --filter @markfix/api exec tsx scripts/verify-project-permissions.ts
TEST_DATABASE_URL=postgresql://markfix:markfix@127.0.0.1:5432/markfix_agent_audit pnpm --filter @markfix/api exec tsx scripts/verify-agent-flow.ts
```

测试创建独立用户和项目，不清空数据库。先在一次性数据库应用迁移。
项目权限检查覆盖跨项目隔离、停用、角色拒绝、邀请并发消费和已有成员权限保持。
Agent 检查使用真实 CLI 子进程、API 和 PostgreSQL，覆盖安装授权、刷新轮换、仓库绑定、原有提交/截图接口、
并发领取、租约、失败重试、版本冲突、断网补传、幂等完成和撤销。

浏览器端到端验收使用隔离的 Electron 浏览器与真实 API：

```sh
MARKFIX_SERVICE_ORIGIN=http://127.0.0.1:14311 pnpm --filter @markfix/dashboard exec vite build --outDir /tmp/markfix-agent-ui-dist
MARKFIX_TEST_DASHBOARD_DIST=/tmp/markfix-agent-ui-dist MARKFIX_BROWSER_SMOKE=true TEST_DATABASE_URL=postgresql://markfix:markfix@127.0.0.1:5432/markfix_agent_audit pnpm --filter @markfix/api exec tsx scripts/verify-agent-flow.ts
```

授权页、后台失败原因与已完成页面已观察并通过行为断言。
原生桌面新入口的绑定保存、重开持久化和目标网页隐藏断言通过；既有预览回放、滚动与页面隔离断言通过。
原生测试已改用正常退出流程并返回成功；预览烟测退出时仍有截图命令因目标关闭而中断的日志，不能声称无警告通过。
测试使用隔离凭据替身，因此不证明真实系统钥匙串成功写入。
网站/后台其他页面使用现有组件烟测覆盖，不能代替真实目标环境验收。

本次由用户指定 GPT-5.6 Sol 进行独立审查，审查者直接检查原始差异、测试和截图，并要求修复发现的问题。审查范围与最终证据见本机 CLI 扩展。
签名、公证、安装包公开发布、实际 Codex 会话自动修复和生产迁移均未验证。

最终证据日志位于 `/tmp/markfix-final-{format,lint,types,tests,build}.log`、`/tmp/markfix-agent-negative-final2.log`、`/tmp/markfix-project-final.log`、`/tmp/markfix-native-quit.log`、`/tmp/markfix-preview-quit.log`、`/tmp/markfix-surfaces-final3.log`。截图为本地隔离测试产物；已直接观察授权、失败与完成详情、项目绑定、成员与账户页面。其他页面有行为烟测与截图，未逐张进行人工式视觉检查。

## 2026-09-10 绑定界面调整

R1：项目名右侧的 shadcn 三点菜单提供“绑定项目 / 删除项目”。绑定弹窗默认“从已有选择”，
仅显示 CLI 上报项目下拉或自定义名称输入框，以及保存按钮。移除旧独立按钮、弹窗修复列表及其无用数据请求。
权限与服务端绑定契约不变。原生烟测验证默认选项、自定义保存/重开、网页隔离、删除取消与确认；
浏览器烟测验证已上报项目选择及保存请求。全仓格式、lint、类型检查、测试和构建通过。
原生退出仍有已知的目标关闭后截图中断日志。

浏览器绑定写入烟测使用同源测试构建，避免测试工具的跨域重定向阻断预检请求：

```sh
MARKFIX_SERVICE_ORIGIN='' pnpm --filter @markfix/dashboard exec vite build --outDir /tmp/markfix-binding-ui-dist
MARKFIX_TEST_DASHBOARD_DIST=/tmp/markfix-binding-ui-dist MARKFIX_AUDIT_SURFACES=true pnpm --filter @markfix/desktop exec electron scripts/smoke-dashboard-components.mjs
MARKFIX_AGENT_SMOKE=true pnpm --filter @markfix/desktop exec electron scripts/smoke-account-ui.mjs
```

## 首次使用授权调整（2026-09-10）

影响范围：CLI 调度和浏览器打开入口、随包 Skill、官网/后台接入提示及使用文档。复用现有设备授权、令牌存储与项目权限契约，不修改 API、数据 schema 或授权范围。无依赖新增，无现有数据迁移。

验证：CLI 子进程连接隔离的本地测试 HTTP 服务，使用临时凭据目录和浏览器替身，覆盖首次授权后恢复原查询、后续复用授权、拒绝不落凭据、不执行查询、跨服务拒绝、不安全授权 URL 拒绝及帮助/非法参数不触发授权。7 项 CLI 测试通过。全项目格式、lint、类型、测试和 build 通过。文档页面已在真实浏览器检查。

限制：没有替用户批准真实设备授权，也未验证 Windows 的系统浏览器调用或生成本次 DMG。用户已确认新增本机标注 CLI 并指定 GPT-5.6 Sol 独立审查，本机扩展验收见下节。

恢复：本次未改变持久化结构，必要时回退本次 CLI/文档版本；已发出的授权仍由现有设备管理撤销。回退不删除凭据、outbox 或项目数据，未同步结果需先处理。

## 本机 CLI 扩展（2026-09-10）

风险 R2。用户明确授权新增本机 CLI、免服务的本机使用路径和切换审查模型；本次只运行隔离测试数据，没有操作已有应用数据库或真实设备授权。

权威边界：标注提交仍由 DraftStore 保存，Report 输入转换移到 packages/annotation-model，云端与本机共用。仅本机已提交快照形成本机 Report，修复状态、尝试与版本只在该 Report 更新；草稿状态不充当修复结果，不写入云端。采用 contracts 的领取、结果、查询与授权输入校验。桌面接口只绑定 127.0.0.1，私有发现文件传输密钥、Host/Origin 校验、CSRF、浏览器项目确认与令牌共同限制访问。云端登录、项目权限和报告队列没有被本机入口绕过。

本机 SQLite 增加 local_agent_state 表，存储本机授权哈希、已上报仓库与报告/任务状态；项目绑定的 repositoryId/repositoryName 统一由 WebsiteProject 保存；初始化为增量建表，不重写已有标注。单实例桌面负责唯一写入，CLI 不直接读写 SQLite。CLI 的 local 子目录隔离本机凭据和 outbox，稳定 profile identity 防止切换桌面数据库后复用授权。

恢复：关闭桌面并备份完整 SQLite 数据文件及 WAL/SHM 后再升级现有安装。本次增加 WebsiteProject.repositoryId，旧版严格校验可能拒绝该字段，因此不能直接降级后连接新数据。优先前向修复；必须回退时恢复完整备份和匹配构建，并先保存升级后的新增数据、制定重放方案。不得删除 Agent 状态或以旧备份直接覆盖新增标注。测试仅创建临时数据库，验证重新实例化后修复结果仍存在、原标注不变、CLOUD 数据不参与本机流程。

自动化覆盖：本机 HTTP/CLI 子进程验证项目隔离、拒绝与撤销、领取冲突、失败重试、完成幂等、截图读取，以及桌面关闭后结果进入 outbox、重启后补传确认。Electron 隔离烟测覆盖云端请求挂起时进入本机、拒绝创建云项目、真实浏览器项目授权、绑定、失败原因展示、重试完成和撤销。

复现：使用 Node 24，运行全仓 format:check、lint、typecheck、test、build；随后运行 `pnpm --filter @markfix/desktop exec electron scripts/smoke-local-agent.mjs`。临时数据与截图路径由烟测输出，不使用真实用户凭据。

剩余限制：local_agent_state 尚无独立结构版本与损坏恢复工具；初始化失败会禁用本机 CLI 并保留原始数据库，桌面窗口仍可启动。Windows 浏览器调用、真实系统钥匙串授权、DMG 签名公证、真实 Codex 自动修复和生产部署未验证。

最终验证：Node 24 下全仓 format:check、lint、typecheck、test、build 通过；本机 Electron 与官网/后台组件烟测正常退出（exit 0），授权页、失败/完成状态、设备撤销、设置子窗口及本地/开发文档截图已检查。系统退出存在 macOS task_policy_set 日志；预期云项目创建拒绝日志属于负向用例。GPT-5.6 Sol 独立 R2 审查通过，无 P0/P1/P2 遗留缺陷。证据日志：`/tmp/markfix-local-{format,lint,types,tests,build}.log`、`/tmp/markfix-local-native-final2.log`、`/tmp/markfix-local-docs-smoke.log`。
