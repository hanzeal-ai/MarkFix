# 阿里云 HTTP 演示发布

目标是杭州轻量应用服务器 `Docker-kjka`（`768b01b0e1b44e1b8aa750cdcffd13e6`），访问地址为 `http://121.40.211.86:8766`。这不是正式生产环境：域名备案完成前使用 HTTP，API 使用现有开发邮件适配器，不承诺邮件投递。请只使用演示数据；HTTP 不保护登录凭据的传输。

## 桌面端 API 环境配置

桌面端使用 electron-vite 的环境文件：`apps/desktop/.env.development` 默认连接 `http://localhost:4310`，`apps/desktop/.env.production` 默认连接 `http://121.40.211.86:8766`。文件仅保存公开地址，不存放凭据。

`pnpm dev:desktop` 使用开发配置；`pnpm --filter @markfix/desktop build` 和 `pnpm --filter @markfix/desktop package:mac` 使用生产配置，并将地址写入构建产物。修改配置后需要重新构建或打包，已安装的旧应用不会自动更新。

启动进程的 `MARKFIX_API_URL` 仍可覆盖构建地址；构建时可用 `MAIN_VITE_API_URL` 或对应的 `.env.*.local` 文件覆盖默认值。未配置覆盖项时，按上述环境文件选择地址。

桌面端左下角账号栏的「更新」按钮会启动 macOS 原生自动更新：保存当前有效批注后，检查、下载、校验、安装并自动重启。强制升级页面也提供同一入口。保存失败或截图批注尚不完整时停止更新，保留编辑内容；下载或校验失败不会调用安装。更新过程中暂停主窗口交互，无需再次确认。详见 [桌面自动更新发布](desktop-updates.md)。

## 自动发布

`.github/workflows/ci.yml` 在 main 更新后依次执行全项目检查、构建 linux/amd64 镜像、发布杭州 ACR 个人版、部署。PR 只运行检查；手动运行也仅允许 main 发布。部署使用镜像 digest，构建发生在 GitHub 托管机器上，不占用目标服务器的构建内存。

目标服务器需要为本仓库注册独立的 GitHub Runner，标签为 `markfix-preview`，以已加入 docker 组的 `admin` 用户运行。该 Runner 拥有 Docker 主机权限，只用于受信任的 main 部署任务。GitHub Environment 名为 `aliyun-preview`，应仅允许 main 分支。ACR 使用专用的仓库登录凭据，无需把本机阿里云 AccessKey 上传到 GitHub。

### 镜像仓库与认证

两个私有仓库位于 `crpi-c94ukgtq3wrezdx5.cn-hangzhou.personal.cr.aliyuncs.com/markfix`，分别为 `markfix-api` 和 `markfix-dashboard`。构建任务推送到 ACR，部署任务从同一仓库按 digest 拉取；不再发布或拉取 GHCR 应用镜像。当前 ACR 个人版拒绝 Buildx 的 provenance attestation 格式，因此两个镜像构建显式关闭该附加元数据；镜像仍按 digest 部署。

运行前，在 GitHub 仓库的 Actions Secrets 中配置以下两项，供构建与部署任务使用：

- `ACR_USERNAME`：ACR「访问凭证」页面提供的 Docker 登录用户名。
- `ACR_PASSWORD`：该用户的 ACR 仓库访问密码，不是阿里云控制台登录密码或 AccessKey Secret。

凭据必须能够向这两个仓库推送和拉取镜像。不得写入代码、文档或日志。部署任务仍使用独立的临时 Docker 配置目录，登录 Action 在结束时登出。

个人版仅用于当前演示环境。此次切换只覆盖应用镜像；`postgres:18-alpine` 仍由 Docker Hub 提供，数据库镜像的首次拉取速度需要单独验证。部署时限暂保留 120 分钟，实际 ACR 拉取耗时以服务器日志为准。

首次切换前保留服务器 `current`、旧镜像和数据卷。失败时继续使用既有应用回退流程；若旧版本来自 GHCR，回退依赖本机已缓存的旧镜像，缺失时须恢复对应仓库认证。回退应用不撤销数据库迁移。

服务器需要 Docker Compose v2、bash、flock、openssl、curl。轻量服务器防火墙需要允许 TCP 8766；数据库和 API 不映射主机端口。DoTasks 的 8765 端口、容器和 Runner 保持独立。

发布脚本为 `infra/aliyun/deploy.sh`，配置存放在 `/home/admin/markfix`：

- `app.env`：首次运行生成的随机数据库密码、认证密钥、演示管理员密码，权限 0600。管理员邮箱为 `admin@markfix.local`；密码需由运维在服务器上安全读取，不写入流水线日志。
- `releases/` 与 `current`：每次发布的 Compose、代理配置和镜像 digest，以及当前成功版本。
- `backups/`：每次迁移前的 PostgreSQL 备份。备份仅在本机，不等于异地容灾；运维需另行安排保留期和异地备份。
- Docker 项目 `markfix-preview`：独立的数据库与截图数据卷，发布不删除数据卷。

后台构建时设置空的 `VITE_API_URL`，通过同源 `/v1/` 代理访问 API。演示环境关闭接口返回认证令牌和自助套餐升级，保留现有随机密码演示管理员登录。

## 数据库与失败恢复

首次发布面向全新、独立的 MarkFix 数据库，使用从权威 Prisma Schema 生成的初始 migration，再执行 `prisma migrate deploy`。不使用 `db push`，不对已有但没有迁移历史的数据库自动做 baseline。若接入已有数据库，应先独立审查、备份并确认 baseline。

后续 Schema 变更必须提交经过审查、兼容上一版应用的 migration。迁移失败会终止发布，保留旧应用，不自动执行数据恢复；由运维检查迁移状态并前向修复。数据库备份是恢复输入，不代表可自动恢复且不丢失新写入。

应用启动或健康检查失败时，脚本重新启动 `current` 中的旧镜像与配置；首次部署失败则停止本次应用容器。此回退不撤销数据库迁移。若旧版本也不能恢复，流水线失败并明确要求人工处理。不要对该项目执行 `docker compose down -v`。

## 验证与转正式环境

本地检查发布控制流：`python3 infra/aliyun/test_deploy.py`。完整验收还需一次真实 GitHub Actions 成功运行，以及目标端口的后台登录、API、数据库迁移和截图持久化验证。仅配置 Runner 或本地检查通过不代表服务已上线。

备案完成后另行配置 HTTPS、真实邮件 Webhook、正式数据库与备份策略，切换 `NODE_ENV=production`，移出演示账号播种配置，并验证 Secure Cookie、邮件和桌面客户端连接策略。不要直接把本文件的 HTTP 演示配置当作生产发布方案。
