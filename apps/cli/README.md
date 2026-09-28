# MarkFix CLI

修复人员通过 CLI 申请访问标注账号，由账号持有人审批；CLI 负责读取标注和回写结果，AI 编程工具负责修改代码和验证。当前版本 **0.1.2**，随包提供 Codex Skill。

## 修复人员：安装、输入账号、等待授权

需要 Node.js 24+、npm、Git 和用于修复代码的 Codex。取得服务管理员提供的 `markfix-cli-0.1.2.tgz` 后执行：

```sh
npm install -g ./markfix-cli-0.1.2.tgz
cd /path/to/your-repository
markfix projects list --account owner@example.com
```

将邮箱替换为**标注账号**。默认连接官方 MarkFix 服务；无需该账号的密码，也无需在修复人员的浏览器中登录对方账号。

CLI 会显示申请码、到期时间和等待提示。请将申请码告知账号持有人并保持命令运行。若账号存在，申请会出现在该账号的桌面端。申请有效期 10 分钟；获批后，原命令自动返回已授权项目并登记当前 Git 仓库、安装 Skill。无需回复“已授权”，无需再次执行命令。

账号持有人未登录桌面时，登录后仍可查看有效申请，也可使用 CLI 输出的网页地址审批。网页只能由指定账号审批。不要让 AI 代替账号持有人点击批准。

授权有效期最长 30 天，期间复用凭据并自动刷新访问令牌。macOS 默认使用系统钥匙串，其他平台使用本机文件凭据（支持 POSIX 权限的平台为目录 0700、文件 0600）；可显式指定 `--credential-store file`。凭据不得分享给其他人。

## 标注账号持有人：批准并提交标注

1. 下载并登录桌面端，创建或选择云端项目，保存标注后点击“提交标注”。仅保存草稿不会进入修复队列。
2. 收到修复授权提示后，进入 **设置 → 修复授权**。
3. 核对当前账号、设备名称和申请码。设备名称由申请方填写，不代表已经验证的人员身份；不认识的申请请拒绝。
4. 勾选允许访问的项目，点击“授权所选项目”。没有默认勾选，也不会开放整个账号。
5. 修复方会自动继续。授权允许读取所选项目的标注与截图、登记仓库、领取任务和回写结果，仍受你的项目角色及问题指派限制。

在相同页面可查看授权设备、项目范围、有效期并撤销。撤销后设备不能继续拉取、刷新令牌或回写。网页账户设置中也可查看待处理申请和撤销授权。

## 开始修复

在同一代码仓库中新建 Codex 会话，确认 MarkFix Skill 已加载，然后发送：

> 使用 MarkFix Skill，读取当前项目已提交的待处理标注，逐条修复、验证并回写结果。

未绑定项目或有多个候选时，Skill 会请求选择；修复人员不需要安装桌面端。项目绑定是可选能力：账号持有人可在桌面项目菜单“绑定项目”中选择 CLI 登记的仓库，之后可自动匹配。自定义名称不会自动绑定同名仓库。

成功回写后进入**待复验**。标注方在桌面检查页面后选择“验证通过”或“退回修复”。修复完成不表示代码已提交、推送或部署。

## 常用命令

正常业务响应以 JSON 写入 stdout；授权进度、提示及错误写入 stderr。`--json` 可显式传入。帮助和版本输出文本。

| 命令                                                         | 用途                                       |
| ------------------------------------------------------------ | ------------------------------------------ |
| `markfix setup --account EMAIL`                              | 显式申请授权；首次业务命令也会自动申请     |
| `markfix auth status`                                        | 查看账号、授权有效期和项目范围             |
| `markfix projects list`                                      | 查看授权项目                               |
| `markfix repo register`                                      | 登记当前 Git 仓库                          |
| `markfix projects resolve`                                   | 解析当前仓库的项目绑定                     |
| `markfix issues list --project PROJECT_ID`                   | 读取 OPEN 状态的已提交标注                 |
| `markfix issues get ISSUE_ID`                                | 读取完整上下文与修复历史                   |
| `markfix issues screenshot ISSUE_ID --output ./issue.png`    | 下载截图，不覆盖已有文件                   |
| `markfix issues claim ISSUE_ID`                              | 领取问题并取得任务 ID                      |
| `markfix fixes renew RUN_ID`                                 | 续期任务，租约为 15 分钟                   |
| `markfix fixes release RUN_ID`                               | 释放任务                                   |
| `markfix fixes complete RUN_ID --result-file ./success.json` | 提交成功结果                               |
| `markfix fixes fail RUN_ID --result-file ./failure.json`     | 提交失败原因                               |
| `markfix sync`                                               | 补传待同步结果                             |
| `markfix logout`                                             | 撤销并移除当前授权；有待同步结果时阻止退出 |
| `markfix --help`                                             | 全部参数                                   |

ID 为接口返回的 UUID。列表返回 `nextCursor` 时，以 `--cursor CURSOR_ID` 继续读取。`--status` 支持 OPEN、FIX_FAILED、IN_PROGRESS、READY_FOR_VERIFY、RESOLVED。失败任务需明确要求重试并使用 `issues claim ISSUE_ID --retry`；同一次领取的安全重试可复用 `--run-id UUID`。

成功结果需真实的验证证据，例如：

```json
{
  "summary": "修正结算金额计算",
  "checks": [{ "command": "npm test -- total", "outcome": "passed", "details": "相关测试通过" }]
}
```

无法完成必要验证时回报失败，例如：

```json
{ "summary": "尚未完成验证", "reason": "缺少测试账号", "stage": "verification", "checks": [] }
```

## 等待、错误与恢复

| 情况                          | 处理方式                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 等待账号持有人批准            | 保持原命令运行，让持有人登录桌面处理；无需提供密码或聊天确认                                                                                                              |
| 没收到申请                    | 核对邮箱、服务实例和申请到期时间；为保护账号隐私，CLI 不公开邮箱是否存在                                                                                                  |
| 拒绝、过期                    | 拒绝时先联系持有人；过期时核对账号后重新执行原命令                                                                                                                        |
| 项目列表为空                  | 检查授权项目范围以及账号当前成员权限                                                                                                                                      |
| 标注列表为空                  | 当前筛选下无已提交记录；检查桌面草稿是否提交、上传是否完成，以及项目和状态筛选                                                                                            |
| 结果等待同步                  | 运行 `markfix sync`；服务器确认前不算回写完成，不要重复修复                                                                                                               |
| 任务或版本冲突                | 重新读取最新详情，不强制覆盖                                                                                                                                              |
| 授权已撤销/过期且有待同步结果 | 运行 `markfix logout --archive-pending` 撤销/清理失效授权并归档保留结果（输出归档路径），然后重新申请。重新读取任务并领取、验证后再回报；归档不会把旧结果强行绑定到新授权 |

退出码：0 成功；1 参数或本地错误；2 授权或权限拒绝；3 任务/版本冲突；4 结果暂存等待上传。`confirmed: false` 不是成功回写。

一个 CLI 数据目录保存一个云端授权。切换账号前先完成 `sync`，再 `logout`，然后用 `--account` 向新账号申请。已配置时显式传入不同账号或服务会被拒绝。CLI 数据默认在 `~/.markfix`，可使用 `MARKFIX_CLI_HOME` 指定独立目录。

## Skill 安装与更新

CLI 首次授权会安装随包 Skill；也可以离线执行：

```sh
markfix skill install
# 更新时先备份旧 Skill，再覆盖：
markfix skill install --force
```

Skill 位于 `$CODEX_HOME/skills/markfix`，未配置时为 `~/.codex/skills/markfix`。更新后新建会话加载。现有文件默认保留，`--force` 返回备份路径。当前 Skill 依赖已安装的 CLI，不提供“只复制 Skill 即无需运行时”的承诺。

## 自托管与仅本机

自托管时，修复方与账号持有人必须使用同一服务：

```sh
markfix projects list --account owner@example.com --server https://your-markfix-server
```

也可设置 `MARKFIX_SERVER`。地址仅包含协议、主机和端口；回环开发服务可加 `--allow-local-http`，远程 HTTP 不受支持。

仅本机项目不上传云端、不使用账号审批，需保持同机桌面运行，每条命令均带 `--local`：

```sh
markfix projects list --local
markfix repo register --local
markfix issues list --project PROJECT_ID --local
```

本机数据和 outbox 与云端隔离。异地修复人员不能读取仅本机项目。云端项目授权不会扩大本机项目权限。

## 下发分组

云端 `issues list` 的 `delivery.groups` 按完整证据分组，仅用于复用修复上下文。每个 `memberId` 仍须读取、领取、验证和回报；不得删除或隐藏源标注。`relatedPages` 只是关联提示，分页始终使用原始 `nextCursor`。本机列表按原始 `items` 逐条处理。云端分组缺失或不一致时停止并报告契约错误。

## 维护者打包

在仓库根目录使用 Node 24 和指定的 pnpm：

```sh
pnpm --filter @markfix/cli pack --pack-destination ./artifacts
```

包内官方服务配置从 `packages/contracts` 生成。打包不会发布 npm。开发文档见 [本地开发指南](../../docs/local-development.md)。
