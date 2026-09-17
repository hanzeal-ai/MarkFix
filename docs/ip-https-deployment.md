# 公网 IP HTTPS 部署记录

2026-09-10 已在杭州轻量服务器 Docker-kjka（121.40.211.86）启用：

| 服务    | 公网地址                   | Nginx 回源            |
| ------- | -------------------------- | --------------------- |
| MarkFix | https://121.40.211.86      | http://127.0.0.1:8766 |
| DoTasks | https://121.40.211.86:8443 | http://127.0.0.1:8765 |

本记录覆盖此前 HTTP 演示文档的访问地址；邮件、桌面签名、业务通知代码部署等状态没有因此改变。未执行业务代码升级或数据库迁移。

## 配置

- 宿主机 Nginx 1.24.0：`/etc/nginx/conf.d/ip-services.conf`。配置副本在 `infra/aliyun/ip-https/`。
- Certbot 5.4.0：隔离 Python 3.11 venv `/opt/certbot-ip`，不替换系统 Python。
- Let’s Encrypt 正式 IP 证书：`/etc/letsencrypt/live/121.40.211.86/`。私钥只保留服务器。staging 签发使用独立目录，未加载测试证书。
- HTTP 80 的 `/.well-known/acme-challenge/` 对应 `/var/www/letsencrypt`。证书续期依赖该公网验证路径，不能关闭 80 或删除挑战配置。
- systemd `certbot-ip-renew.timer` 每天两次运行，随机延迟最多一小时，开机补跑错过的计划。每次成功执行 renew 后均验证并重载 Nginx，避免前次证书重载失败后无法自动重试。
- 新增云防火墙 TCP 8443 规则，ID `5be368b23c9343ee94d0028f54cb6df3`；原 80/443 已放行。旧 HTTP 8765/8766 暂保留以兼容现有客户端，不视为全站强制 HTTPS。
- MarkFix `/home/admin/markfix/app.env` 设置 `MARKFIX_SERVICE_ORIGIN=https://121.40.211.86`。API 使用原镜像重建；外层代理为 markfix_access、markfix_refresh Cookie 添加 Secure。
- DoTasks `/home/admin/dotasks/.env` 设置 `DOTASKS_PUBLIC_URL=https://121.40.211.86:8443`。当前 Compose 保留旧 8765 Host/Origin 兼容，应用使用原镜像重建。
- GitHub `hanzeal-ai/DoTasks` 的 `DOTASKS_PUBLIC_URL` Actions Secret 已同步，防止下一次部署回到 HTTP。后续部署生成的 Compose 默认只信任新的公开地址；仍使用旧 HTTP 的客户端应先切换。
- 本机 `~/Library/Application Support/DoTasks/cloud-agent.json` 只修改 cloud_url，原凭据保留；备份 `cloud-agent.pre-https-20260910.json`，权限 600。已运行的进程可能仍缓存旧地址，重启后读取新配置。

已安装 MarkFix 桌面包的编译默认地址未改变；应在其支持的服务地址配置中选择新 HTTPS 地址，后续打包也应指定 `MARKFIX_SERVICE_ORIGIN=https://121.40.211.86`。CLI 使用 `--server https://121.40.211.86` 发起授权。

## 已验证

- 正式证书公网可信：curl 校验结果 0，两端均未跳过证书验证。
- MarkFix 健康检查 200；服务器端执行登录 201、两个 Cookie 均 Secure/HttpOnly，随后注销测试会话。
- Chrome 加载 HTTPS 官网和文档，页面生成的 CLI 命令为 `markfix projects list --server https://121.40.211.86`。
- DoTasks 使用正确凭据及新 Origin 读取设置 200；非法 Origin、非法 Host 均 403；未认证入口 401。
- 本机 DoTasks Agent 用原凭据在新 HTTPS 地址成功调用只读 `list_board`。
- 所有原业务容器 healthy；Nginx 配置检查及 systemd unit 检查成功。
- Certbot `renew --dry-run` 成功；续期服务实际运行 Result=success、ExecMainStatus=0，timer 与 Nginx 已开机启用。
- 独立审查完成静态检查，指出 Host/Origin、Cookie Secure、重载重试问题，均已按建议修正并验证。

本次未验收所有桌面安装包。

## 维护与恢复

服务器检查命令：

```sh
systemctl status nginx certbot-ip-renew.timer --no-pager
systemctl show certbot-ip-renew.service -p Result -p ExecMainStatus
journalctl -u certbot-ip-renew.service --since '7 days ago'
/opt/certbot-ip/bin/certbot certificates
/opt/certbot-ip/bin/certbot renew --dry-run
```

原配置与敏感 env 备份位于服务器 `/root/ip-https-backup-20260910`，目录仅 root 可读，不应下载或提交。包含原 nginx 目录、启用状态、MarkFix app.env、DoTasks .env 和 Compose。回退服务环境前先备份当前配置、确认没有后续改动，并使用原镜像按既有 Compose 命令重建对应应用；不得删除数据卷或恢复业务数据库。

若仅 HTTPS 代理故障，可先验证配置并前向修复，原 HTTP 业务端口仍在。必须撤销本次配置时，停用续期 timer，撤下本次 ip-services.conf 并通过 nginx -t 后按原状态停用宿主 Nginx，同时恢复服务地址、本机 Agent 地址及 GitHub 地址配置。证书材料保留供审计；如需移除新增 8443 防火墙规则，按上面的精确 ID 操作。操作前重新确认无后续共享依赖。
