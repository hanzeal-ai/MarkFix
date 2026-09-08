# 阿里云 HTTP 演示发布

目标是杭州轻量应用服务器 `Docker-kjka`（`768b01b0e1b44e1b8aa750cdcffd13e6`），访问地址为 `http://121.40.211.86:8766`。这不是正式生产环境：域名备案完成前使用 HTTP，API 使用现有开发邮件适配器，不承诺邮件投递。请只使用演示数据；HTTP 不保护登录凭据的传输。

## 自动发布

`.github/workflows/ci.yml` 在 main 更新后依次执行全项目检查、构建 linux/amd64 镜像、发布 GHCR、部署。PR 只运行检查；手动运行也仅允许 main 发布。部署使用镜像 digest，构建发生在 GitHub 托管机器上，不占用目标服务器的构建内存。

目标服务器需要为本仓库注册独立的 GitHub Runner，标签为 `markfix-preview`，以已加入 docker 组的 `admin` 用户运行。该 Runner 拥有 Docker 主机权限，只用于受信任的 main 部署任务。GitHub Environment 名为 `aliyun-preview`，应仅允许 main 分支。无需把本机阿里云 AccessKey 上传到 GitHub；GHCR 使用当前任务的短期 `GITHUB_TOKEN`。

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
