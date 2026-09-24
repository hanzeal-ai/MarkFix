# 阿里云演示发布

目标是杭州轻量应用服务器 `Docker-kjka`（`768b01b0e1b44e1b8aa750cdcffd13e6`），官网公开入口为 `https://markfix.hanzeal.com`，宿主机服务端口为 8766。2026-09-24 已验证 HTTPS 官网与 /v1/health 可访问。API 仍使用现有开发邮件适配器，不承诺邮件投递；此配置仍为演示环境。

## 桌面端 API 环境配置

公开服务地址统一维护在 `packages/contracts/src/service-config.ts` 的 `productionOrigin`。当前为 `https://markfix.hanzeal.com`；后续更换地址时修改此处，再重新构建、打包及部署。桌面端 API、更新检查、官网与账户入口，以及服务端授权链接、邮件链接、升级链接和 CORS 均读取此配置。网页正式构建使用当前站点的同源 API，CLI setup 命令也由该地址生成。

本地开发的网页/API 端口也集中在同一文件。特殊测试或自托管使用统一的 `MARKFIX_SERVICE_ORIGIN` 覆盖值；它必须是不带路径、凭据、查询参数的单个 HTTP(S) 源地址，覆盖后网站和 API 同源。网页构建和桌面端构建读取进程变量或各自的 `.env.local`；桌面端及 API 运行时读取进程变量。正式默认地址变更不需要额外设置覆盖值；如设置过覆盖值，需要移除或同步它，避免覆盖新默认值。

预览容器通过 `MARKFIX_SERVICE_MODE=production` 选择公开地址，同时保留 `NODE_ENV=development` 的演示邮件行为。旧的分散 API/dashboard 环境变量不再使用。现有服务器 app.env 中的旧地址不会覆盖共享默认值。

CLI 授权和桌面账户外链要求 HTTPS。正式签名更新包也继续要求 HTTPS。服务地址配置不会放宽这些安全策略。

地址切换失败时，将共享配置恢复为上一个可用源地址，再重新构建并部署对应服务及桌面包；网页同源路由同时恢复。此配置调整不涉及数据库迁移。已安装桌面包不会因源码配置变化而自动更新，仍需安装新版本。

已签名 macOS 正式包中，桌面端左下角账号栏的「更新」按钮会启动原生自动更新：保存当前有效批注后，检查、下载、校验、安装并自动重启。强制升级页面也提供同一入口。保存失败或截图批注尚不完整时停止更新，保留编辑内容；下载或校验失败不会调用安装。更新过程中暂停主窗口交互，无需再次确认。当前 macOS 和 Windows 未签名试用包点击更新打开官网，需手动覆盖安装。详见 [桌面自动更新发布](desktop-updates.md)。

## 自动发布

`.github/workflows/ci.yml` 在 main 更新后依次执行全项目检查、构建 linux/amd64 镜像归档、将归档传给目标 Runner、在阿里云本地推送 ACR 个人版、按 digest 部署。PR 只运行检查；手动运行也仅允许 main 发布。部署使用镜像 digest，构建发生在 GitHub 托管机器上，不占用目标服务器的构建内存。

目标服务器需要为本仓库注册独立的 GitHub Runner，标签为 `markfix-preview`，以已加入 docker 组的 `admin` 用户运行。该 Runner 拥有 Docker 主机权限，只用于受信任的 main 部署任务。GitHub Environment 名为 `aliyun-preview`，应仅允许 main 分支。ACR 使用专用的仓库登录凭据，无需把本机阿里云 AccessKey 上传到 GitHub。

### 镜像仓库与认证

两个私有仓库位于 `crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/markfix`，分别为 `markfix-api` 和 `markfix-dashboard`。构建任务通过 Actions Artifact 传输 Docker 镜像归档，目标 Runner 加载并推送 ACR，部署任务从同一仓库按 digest 拉取；不再发布或拉取 GHCR 应用镜像。当前 ACR 个人版拒绝 Buildx 的 provenance attestation 格式，因此两个镜像构建显式关闭该附加元数据；镜像仍按 digest 部署。

运行前，在 GitHub 仓库的 Actions Secrets 中配置以下两项，供构建与部署任务使用：

- `ACR_USERNAME`：ACR「访问凭证」页面提供的 Docker 登录用户名。
- `ACR_PASSWORD`：该用户的 ACR 仓库访问密码，不是阿里云控制台登录密码或 AccessKey Secret。

凭据必须能够向这两个仓库推送和拉取镜像。不得写入代码、文档或日志。部署任务仍使用独立的临时 Docker 配置目录，登录 Action 在结束时登出。

个人版仅用于当前演示环境。此流程只覆盖应用镜像；`postgres:18-alpine` 仍由 Docker Hub 提供，数据库镜像的首次拉取速度需要单独验证。部署时限暂保留 120 分钟，实际 ACR 拉取耗时以服务器日志为准。

首次切换前保留服务器 `current`、镜像和数据卷。当前数据契约不支持旧镜像回退；失败后保持应用停服并前向修复，不能把旧镜像直接连接到已迁移数据库。

服务器需要 Docker Compose v2、bash、flock、openssl、curl、Python 3.8+。轻量服务器防火墙需要允许 TCP 8766；数据库和 API 不映射主机端口。DoTasks 的 8765 端口、容器和 Runner 保持独立。

发布脚本为 `infra/aliyun/deploy.sh`，配置存放在 `/home/admin/markfix`：

- `app.env`：首次运行生成的随机数据库密码、认证密钥、演示管理员密码，权限 0600。管理员邮箱为 `admin@markfix.local`；密码需由运维在服务器上安全读取，不写入流水线日志。
- `releases/` 与 `current`：每次发布的 Compose、代理配置和镜像 digest，以及当前成功版本。
- `backups/`：每次迁移前的 PostgreSQL 备份。备份仅在本机，不等于异地容灾；运维需另行安排保留期和异地备份。
- Docker 项目 `markfix-preview`：独立的数据库与截图数据卷，发布不删除数据卷。

后台正式构建通过同源 `/v1/` 代理访问 API。演示环境关闭接口返回认证令牌和自助套餐升级，保留现有随机密码演示管理员登录。

## 数据库与失败恢复

首次发布面向全新、独立的 MarkFix 数据库，使用从权威 Prisma Schema 生成的初始 migration，再执行 `prisma migrate deploy`。不使用 `db push`，不对已有但没有迁移历史的数据库自动做 baseline。若接入已有数据库，应先独立审查、备份并确认 baseline。

后续 Schema 变更必须提交经过审查的 migration。存在未解决的失败迁移时，脚本在停止在线应用前中止，需先诊断，不能自动标记迁移成功或清理业务数据。脚本先备份数据库，再停止 API 与后台，然后迁移并启动本次镜像。迁移、启动或健康检查失败都会保持应用停止，提示备份位置并要求前向修复，不会自动启动旧镜像。`current` 仅记录上次成功发布，不代表该镜像仍适用于当前数据库。

当前迁移要求 captureBundle v2，并拒绝旧批注表中的记录、旧活动状态、workspaceId 和缺少当前上下文的批注。遇到拒绝时，数据事务回滚；需要另行授权维护与核对数据，不能删除记录来绕过检查。完整边界见 [当前数据契约](current-contract.md)。

备份发生在停止应用之前；它不包含之后的写入，不可作为无损自动恢复点。若必须恢复旧版本，应另行授权停写、核对备份后的写入，并恢复匹配的数据库、截图文件及镜像组合。不要执行 `docker compose down -v`。

## 验证与转正式环境

本地检查发布控制流：`python3 infra/aliyun/test_deploy.py`。完整验收还需一次真实 GitHub Actions 成功运行，以及目标端口的后台登录、API、数据库迁移和截图持久化验证。仅配置 Runner 或本地检查通过不代表服务已上线。

转正式环境仍需配置真实邮件 Webhook、正式数据库与备份策略，切换 `NODE_ENV=production`，移出演示账号播种配置，并验证 Secure Cookie、邮件和桌面客户端连接策略。不要直接把本文件的演示配置当作生产发布方案。

## 官网桌面下载

官网部署完成后，Desktop downloads 工作流自动构建 Windows x64 EXE 和 macOS Apple Silicon DMG。下载文件保存在 `$HOME/markfix/downloads`，由 dashboard 的 Nginx 只读挂载并提供 `/downloads/`；更换 dashboard 镜像不会删除安装包。包地址包含平台、版本和源提交，已发布文件不可覆盖。

服务器先验证包摘要和公网匿名下载，再更新 app.env 的对应平台下载策略，重启 API 并检查策略响应。失败自动恢复原配置；配置备份位于 backups/desktop-policy-*.env，含敏感配置，仅服务器用户可读。发布与站点部署共用 deploy.lock，并要求 source.sha 与包提交相同，避免旧任务覆盖新部署。

本地发布器检查：`python3 infra/aliyun/test_publish_desktop.py`。试用包与正式签名模式见 [桌面下载发布](windows-desktop.md)。安装包上架不执行数据库迁移。
