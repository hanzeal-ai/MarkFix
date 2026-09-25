# MarkFix CLI

将 MarkFix 云端或仅本机标注接入 Codex 会话。CLI 负责授权、项目识别、标注读取和结果同步；Codex 负责修改代码与执行验证。

本文适用于 CLI **0.1.1**。当前支持 Codex，通过随包提供的 MarkFix Skill 接入。

本机模式无需云端账号，见下方“本地与云端”；以下快速开始介绍云端服务。

## 更新 CLI 与 Skill

取得新版本安装包后执行：

```sh
npm install -g ./markfix-cli-0.1.1.tgz
markfix --version
markfix skill install --force
```

Skill 更新无需桌面运行或云端授权，覆盖前会备份旧文件并返回 `backupPath`；新建 Codex 会话加载更新。首次单独安装可用 `markfix skill install`，已有文件会保留。更新 CLI 不会删除凭据或待同步结果。

## 从网页标注到修复

1. 在桌面创建仅本机或云端项目，打开目标页面。
2. 元素批注：选中元素，在页面内输入备注，按 Enter 或点击提交保存。
3. 截图标注：进入截图模式冻结当前画面，框选并标记，在工具栏旁填写备注并提交。
4. 在右侧预览检查记录，再使用右上角提交入口勾选要交给 Agent 的标注。仅保存备注不会进入 CLI 队列。
5. 在对应代码仓库登记并绑定项目，再让 Codex 读取、修复、验证和回写。

## 云端前置条件

- Node.js 24 或更高版本、npm 和 Git。
- 本机可用的 Codex，以及准备修复的 Git 仓库。
- MarkFix 账号、目标云端标注项目的成员权限，以及该服务的 HTTPS API 地址。
- 绑定项目需要项目所有者或管理员权限。领取与回写还受当前项目角色、问题指派和授权范围限制。

“代码项目”指本地 Git 仓库，“标注项目”指 MarkFix 中收集问题的项目。本地未提交的标注不会出现在 CLI 查询结果中。

## 快速开始

### 1. 安装

从 MarkFix 服务管理员获取 `markfix-cli-0.1.1.tgz`。在安装包所在目录执行：

```sh
node --version
npm install -g ./markfix-cli-0.1.1.tgz
markfix --version
```

预期版本输出为 `0.1.1`。安装、帮助和版本查询不会发起授权。

### 2. 首次使用自动授权

进入代码仓库，将示例域名替换为实际的 MarkFix **API 地址**。地址仅包含协议、主机和可选端口，不包含 `/v1`、路径或查询参数。

```sh
cd /path/to/your-repository
markfix projects list --server https://markfix.example.com
```

首次执行服务命令时，CLI 自动打开浏览器；授权通过后继续原命令。

通过 Skill 调用时，会话只用进度消息展示授权链接，并持续等待原 CLI 进程；不弹出要求回复“已授权”的问答。即使命令首次返回时就已授权成功，也应直接读取 JSON 并继续拉取，不再等待人工确认。

1. 在 CLI 打开的授权页面登录 MarkFix。
2. 核对网页与终端中的授权码，选择允许访问的标注项目。
3. 点击“授权此设备”，返回终端等待完成。

成功后返回原命令的 JSON（本例为 `projects` 列表）。授权会保存凭据、安装 Skill 并登记当前 Git 仓库；若 stderr 提示仓库登记失败，在正确仓库执行 `markfix repo register` 补充登记。后续命令复用授权，不重复打开浏览器。

首次服务地址可通过 `--server` 或 `MARKFIX_SERVER` 提供；交互式终端未提供地址时会提示输入。非交互式调用必须明确提供地址。已授权目录使用保存的服务地址，显式传入其他服务地址会被拒绝。

macOS 默认使用系统钥匙串。Linux、Windows 须显式选择文件存储：

```sh
markfix projects list --server https://markfix.example.com --credential-store file
```

无法自动打开浏览器时添加 `--no-browser`，手动访问终端输出的链接。授权码过期后重新执行原命令。授权被拒绝时命令停止，不会读取项目。

### 3. 绑定项目

在 MarkFix 桌面端悬浮目标**云端项目**，点击项目名右侧的三点菜单，选择“绑定项目”。保持“从已有选择”，选择 CLI 上报的仓库记录，核对名称与设备后保存。

- **从已有选择**：建立与具体仓库记录的关联，供后续会话自动匹配。
- **自定义**：仅保存仓库名称。仓库上报后需通过“从已有选择”确认关联，同名不会自动匹配。
- **不绑定**：Codex 会在没有唯一匹配时请求选择标注项目；该选择仅用于当前会话。

首次授权登记当前 Git 仓库。处理其他仓库时，Skill 会先执行 `repo register`；也可以在对应仓库手动执行该命令。

### 4. 验证

```sh
markfix auth status
markfix projects resolve
```

- `auth status` 返回 `authorized: true`：当前授权有效。
- `projects resolve` 返回 `selectionRequired: false`：当前仓库唯一匹配到一个已授权标注项目。
- `selectionRequired: true`：执行 `markfix projects list` 查看可选项目，或检查绑定。

复制返回项目的 `id`，替换 `PROJECT_ID`：

```sh
markfix issues list --project PROJECT_ID
```

返回 `items` 即读取成功。空数组表示没有符合筛选条件的记录；默认只查询 `OPEN`。返回 `nextCursor` 时，用 `--cursor CURSOR_ID` 读取下一页。

### 5. 使用 Codex

在同一仓库中新建会话，确认 MarkFix Skill 已加载，然后发送：

> 使用 MarkFix Skill，读取当前项目的待处理标注。逐条修复并运行必要验证，将每条问题的修复结果回写到 MarkFix。

Skill 默认安装在 `~/.codex/skills/markfix/SKILL.md`；设置 `CODEX_HOME` 时位于该目录下的 `skills/markfix/SKILL.md`。已有同名文件不会自动覆盖；需要升级时运行 `markfix skill install --force`，旧文件会先备份。

AI 成功回写后进入“待复验”。在桌面批注预览中核对页面后选择“验证通过”或填写原因“退回修复”；云端也可由有权限的成员在管理后台确认。已验证不表示代码已经提交或部署。失败记录包含具体原因与阶段。

## 命令参考

所有命令在当前目录运行。`PROJECT_ID`、`ISSUE_ID`、`RUN_ID`、`CURSOR_ID` 均为服务端返回的 UUID；示例中的大写占位符需要替换。

| 命令                                                         | 用途                                 |
| ------------------------------------------------------------ | ------------------------------------ |
| `markfix setup --server URL`                                 | 可选的显式初始化；日常命令会自动授权 |
| `markfix auth status`                                        | 检查授权                             |
| `markfix repo register`                                      | 上报当前仓库；重复执行更新同一记录   |
| `markfix projects list`                                      | 列出授权范围内且仍有权限的标注项目   |
| `markfix projects resolve`                                   | 查找当前仓库已绑定的标注项目         |
| `markfix issues list --project PROJECT_ID`                   | 分页读取待处理标注                   |
| `markfix issues get ISSUE_ID`                                | 读取完整上下文和修复历史             |
| `markfix issues screenshot ISSUE_ID --output ./issue.png`    | 下载截图；不覆盖已有文件             |
| `markfix issues claim ISSUE_ID`                              | 领取问题并取得修复任务 ID            |
| `markfix fixes renew RUN_ID`                                 | 续期任务租约                         |
| `markfix fixes release RUN_ID`                               | 放弃当前任务                         |
| `markfix fixes complete RUN_ID --result-file ./success.json` | 提交验证成功的结果                   |
| `markfix fixes fail RUN_ID --result-file ./failure.json`     | 提交失败原因                         |
| `markfix sync`                                               | 重传本机待同步结果                   |
| `markfix logout`                                             | 撤销当前授权并删除本机凭据           |
| `markfix --help`                                             | 查看全部参数                         |

`issues list --status` 支持 `OPEN`、`FIX_FAILED`、`IN_PROGRESS`、`READY_FOR_VERIFY`、`RESOLVED`。重试失败记录时先读取最新内容，再执行 `issues claim ISSUE_ID --retry`。同一领取请求需要安全重试时，可预先指定 `--run-id UUID` 并重复使用该 ID。

### 修复结果格式

下面是格式示例；提交时必须替换为实际修改与验证结果，不能直接将示例当作成功证据。

`success.json`：

```json
{
  "summary": "修正结算页合计金额的计算逻辑。",
  "checks": [
    {
      "command": "npm test -- total",
      "outcome": "passed",
      "details": "合计金额相关测试通过。"
    }
  ]
}
```

成功结果必须包含至少一条通过的检查。无法执行必要验证时应回报失败，例如 `failure.json`：

```json
{
  "summary": "尚未完成修复验证。",
  "reason": "缺少复现所需的测试账号。",
  "stage": "verification",
  "checks": []
}
```

任务租约为 15 分钟，较长任务应及时续期。标注版本变化、权限收回或租约失效时，旧结果可能被拒绝；重新读取问题，不要强制覆盖。

### 输出与退出码

正常业务响应以 JSON 写入 stdout；授权指引、提示和错误写入 stderr。`--json` 可显式传入。帮助和版本命令输出文本。

| 退出码 | 含义                     | 下一步                                  |
| ------ | ------------------------ | --------------------------------------- |
| 0      | 命令成功                 | 根据返回内容继续                        |
| 1      | 参数、本地配置或其他错误 | 阅读 stderr；缺少本地授权配置也属于此类 |
| 2      | 服务端拒绝授权或权限不足 | 检查账号、项目成员身份及授权范围        |
| 3      | 任务、版本或结果冲突     | 重新读取问题，确认任务状态              |
| 4      | 结果已暂存，等待上传     | 恢复连接后执行 `markfix sync`           |

`confirmed: false` 不代表任务完成。结果补传成功前不要重复修复，也不要 logout 或切换服务：暂存结果关联原来的服务和授权。

## 配置与权限

| 项目         | 默认行为                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------- |
| CLI 数据目录 | `~/.markfix`，可通过 `MARKFIX_CLI_HOME` 指定                                              |
| macOS 凭据   | 系统钥匙串                                                                                |
| 显式文件凭据 | 数据目录中的 `credential.json`；目录权限 0700、文件权限 0600，在支持 POSIX 权限的平台生效 |
| Codex Skill  | `$CODEX_HOME/skills/markfix`，未配置时为 `~/.codex/skills/markfix`                        |
| 访问令牌     | 15 分钟；CLI 自动刷新                                                                     |
| 设备授权     | 最长 30 天，可在 MarkFix 的“Agent 接入”页面撤销                                           |

仓库登记只上传仓库名称、随机标识和设备信息，不上传源代码、本地绝对路径或会话记录。修复回写会上传提供的摘要、检查记录与失败原因，请避免在这些内容中包含凭据。

## 常见问题

**无法找到 `markfix` 命令**

检查安装是否成功、Node.js 版本是否满足要求，以及 npm 全局可执行目录是否在 PATH 中。重新打开终端后运行 `markfix --version`。

**下拉列表没有刚登记的项目**

在对应 Git 仓库执行 `markfix repo register`，关闭并重开绑定弹窗。核对桌面与 CLI 的服务地址、账号和项目权限。本机项目需要在每条 CLI 命令上添加 `--local`，上报和绑定都留在本机。

**授权成功，但项目列表为空**

授权时必须选中目标项目，且账号现在仍需是该项目的有效成员。扩大授权范围前，先同步待上传结果，再 logout、重新执行 `projects list` 并在浏览器选择所需项目。

**无法重复执行 setup**

一个 CLI 数据目录同时保存一份服务授权。切换账号或服务时先完成待同步任务，再执行 `markfix logout`。

**开发环境使用 HTTP**

仅回环地址可显式启用 HTTP：

```sh
markfix projects list --server http://127.0.0.1:4310 --allow-local-http
```

远程 HTTP 服务需要先配置 HTTPS，不能通过此参数跳过限制。

## 本地与云端

桌面端“仅本机”项目保存在本机 SQLite。登录页选择“仅在本机使用”，不需要云端账号。创建项目、保存标注后提交选中记录；保持桌面运行，在代码仓库执行：

```sh
markfix projects list --local
markfix repo register --local
markfix projects resolve --local
markfix issues list --project PROJECT_ID --local
```

本机 CLI 自动连接桌面，对所有本地项目拥有完整访问权限，无需配置、浏览器授权或凭据存储。每条本机命令都带 `--local`，包括 `fixes` 和 `sync`；本机连接信息和 outbox 保存在 CLI 数据目录的 `local` 子目录，与云端隔离。关闭桌面后本机接口不可用；重启后自动恢复连接。标注与结果均不上传云端。

桌面项目菜单支持从本机 CLI 上报的仓库中选择绑定；修复完成或失败及原因显示在桌面批注面板（重新聚焦或最多等待 30 秒刷新）。本机无需 logout，也没有授权管理入口；领取租约仍为 15 分钟，用于避免并发修复冲突。本机 CLI 权限属于当前系统用户，不沿用云端项目成员角色。

若需要开发和验证云端协作流程，可启动本地 API、数据库和管理后台，再在桌面端创建“云端协作”项目并提交标注。此时数据位于你自己的本地服务，仍按服务端项目权限授权，不会读取或上传已有的仅本机项目。完整启动、构建命令见 [开发与本地使用](../../docs/local-development.md)。

## 下发分组与源记录

云端／自托管 API 的 `issues list` 保留原始 `items` 和 `nextCursor`，增加只读的 `delivery` 修复规划信息。`groups` 将同一页内项目、环境、人员、状态、优先级、文字、完整捕获上下文（包括捕获时间）和截图 SHA-256 一致的记录放入一组；源标注 ID 和截图存储路径不参与内容比较。缺少必要证据或证据格式不支持时，记录保持独立。每组保留全部 `memberIds`，不删除、修改或自动关闭源标注与报告。

执行端可为证据一致的一组复用修复上下文，但仍须逐条读取最新详情、领取、验证并回报结果。`relatedPages` 只提示同项目、环境和完整页面 URL 下的候选，不能作为重复结论；文字相似或模型判断不能直接隐藏任务。分页仍以原始 `nextCursor` 为准，跨页不自动去重。仅本机模式继续按原始列表工作。

这项能力需要更新 API 和执行端使用的 MarkFix Skill。CLI 初始化会保留已有 Skill；使用 `markfix skill install --force` 备份并更新。仅更新 API 不会让旧 Skill 自动复用分组。云端响应必须包含完整分组信息；缺失或与原始任务不一致时停止处理并报告服务契约错误。本机端按当前 `items` 契约逐条处理。

## 从源码打包

供维护者使用。在 MarkFix 仓库根目录，按根 `packageManager` 指定的 pnpm 版本执行：

```sh
pnpm --filter @markfix/cli pack --pack-destination ./artifacts
```

将生成的 `.tgz` 提供给使用者。打包与本地安装不会自动发布到 npm。
