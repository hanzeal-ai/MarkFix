# MarkFix

**Mark it. Fix it.** 在网页上选中元素、添加批注或截图标记，把可复现的问题上下文交给研发与 Codex。

## 使用方式

- **仅本机**：桌面端保存项目和标注到本机 SQLite。无需云端账号，CLI 使用 `--local` 处理已提交的本机标注。
- **云端协作**：项目按成员与角色授权；提交标注后，可在管理后台处理，或通过 CLI 交给 Codex 修复并回写结果。
- **本地自建服务**：在开发机器运行 API、数据库及管理后台，桌面选择「云端协作」，CLI 连接本地 API。数据不必发送到托管服务。

安装 CLI 不要求授权。首次执行服务命令时自动打开浏览器，用户批准后继续原命令。帮助和版本查询不授权。

## 文档

- [本地使用、开发启动与 macOS 构建](docs/local-development.md)
- [CLI 安装、首次授权与命令参考](apps/cli/README.md)
- 官网 `/docs`：元素批注、截图标注、快捷键、本地与云端、Codex 接入、开发与构建。

## 快速启动开发环境

需要 Docker Desktop / Compose v2；桌面开发另外需要 macOS、Node.js 24、pnpm 11.25.0 和 Xcode Command Line Tools。

```sh
docker compose up --build -d
pnpm install
pnpm --filter @markfix/database db:generate
pnpm --filter @markfix/desktop rebuild:native
MARKFIX_ALLOW_HTTP=true pnpm dev:desktop
```

官网与后台：<http://localhost:4311>；API：<http://localhost:4310/v1/health>。
开发账号 `admin@markfix.local` / `markfix-admin`。Compose 使用开发数据库同步与示例凭据，不是生产部署或迁移方案。

## 验证

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

签名、公证、正式发布、生产存储和邮件投递需要对应环境的独立验证。
