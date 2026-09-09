# 项目权限与 CLI 接入交付记录

## 当前契约

风险 R2：公开接口、委托授权、项目权限、数据归属和标注状态变更。
用户已授权实现、移除工作区和逐任务本地提交；未授权推送、发布、部署或迁移现有数据库。

- 工作区业务模型、接口、字段和选择器全部移除。项目直接归属用户，协作使用项目成员和项目角色。
- `packages/contracts` 定义共享接口；Prisma schema 定义服务端持久化；`authorization.ts` 定义修复权限。
- CLI 使用浏览器设备授权，用户选择允许访问的项目。每次请求仍检查实时项目成员权限；令牌不能用于普通账号接口。
- 首次 setup 注册当前 Git 项目，Codex Skill 在后续仓库会话中自动注册当前项目。只上传名称和随机标识，不上传本地目录、代码或会话内容。
- 桌面端与后台可选择已上报仓库。手动输入名称保存为待绑定信息；为避免同名误匹配，只有确认具体上报记录后才自动解析项目。没有唯一绑定时由会话选择。
- 当前仅支持 Codex，通过 `agentType` 和独立 Skill 保留其他 Agent 接入位置，不包含 MCP 或旧接口适配。
- LOCAL 项目只保存本地仓库名称；CLI 处理已提交服务器的 CLOUD 标注。
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
markfix setup --server https://your-markfix-server
```

包包含 Codex Skill，setup 在授权后安装。此命令说明不代表已经公开发布安装包或部署服务。
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
VITE_API_URL=http://127.0.0.1:14311 pnpm --filter @markfix/dashboard exec vite build --outDir /tmp/markfix-agent-ui-dist
MARKFIX_TEST_DASHBOARD_DIST=/tmp/markfix-agent-ui-dist MARKFIX_BROWSER_SMOKE=true TEST_DATABASE_URL=postgresql://markfix:markfix@127.0.0.1:5432/markfix_agent_audit pnpm --filter @markfix/api exec tsx scripts/verify-agent-flow.ts
```

授权页、后台失败原因与已完成页面已观察并通过行为断言。
原生桌面新入口的绑定保存、重开持久化和目标网页隐藏断言通过；既有预览回放、滚动与页面隔离断言通过。
原生测试已改用正常退出流程并返回成功；预览烟测退出时仍有截图命令因目标关闭而中断的日志，不能声称无警告通过。
测试使用隔离凭据替身，因此不证明真实系统钥匙串成功写入。
网站/后台其他页面使用现有组件烟测覆盖，不能代替真实目标环境验收。

独立审查尚未完成：审查 Agent 因模型额度失败，已向用户请求更换审查模型或指定人工审查。
依据 Vibe Coding，实施者的自动检查不能代替独立审查；当前不宣称完整交付验收或可直接生产发布。
签名、公证、安装包公开发布、实际 Codex 会话自动修复和生产迁移均未验证。

最终证据日志位于 `/tmp/markfix-final-{format,lint,types,tests,build}.log`、`/tmp/markfix-agent-negative-final2.log`、`/tmp/markfix-project-final.log`、`/tmp/markfix-native-quit.log`、`/tmp/markfix-preview-quit.log`、`/tmp/markfix-surfaces-final3.log`。截图为本地隔离测试产物；已直接观察授权、失败与完成详情、项目绑定、成员与账户页面。其他页面有行为烟测与截图，未逐张进行人工式视觉检查。
