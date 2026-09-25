# MarkFix

**Mark it. Fix it.**

MarkFix 让你直接在网页上选中元素、添加批注或截图标记，把问题位置、页面上下文和复现信息交给研发与 Codex，并跟踪修复结果。

[快速开始](#快速开始) · [开发与验证](#开发与验证) · [文档](#文档) · [反馈与贡献](#反馈与贡献)

## 功能

- 在目标网页上选择元素，添加批注与截图标记。
- 保存页面上下文，重新打开页面时回放已保存标注。
- 按页面隔离标注，保留问题的复现位置。
- 使用本机模式独立工作，或通过云端项目与成员协作。
- 通过 CLI 读取标注、交给 Codex 处理并回写结果。

## 使用方式

| 模式         | 数据与使用方式                                                             |
| ------------ | -------------------------------------------------------------------------- |
| 仅本机       | 项目和标注保存在桌面端 SQLite，无需云端账号；CLI 使用 `--local` 连接桌面端 |
| 云端协作     | 项目按成员和角色授权，通过管理后台或 CLI 处理已提交标注                    |
| 本地自建服务 | 在自己的机器运行 API、数据库及管理后台，桌面端选择「云端协作」并连接该服务 |

CLI 安装不要求授权。首次执行云端服务命令时会打开浏览器请求授权，批准后继续原命令；本机 `--local` 自动连接桌面端。详见 [CLI 使用说明](apps/cli/README.md)。

## 项目状态与运行条件

项目处于发布前阶段。开发需要 Node.js 24+ 和项目指定的 pnpm 11.25.0。macOS 桌面开发需要 Xcode Command Line Tools；Windows 的依赖、打包与验收见 [Windows 指南](docs/windows-desktop.md)。

仅本机模式无需启动云端服务。开发云端协作功能时，还需要 Docker Desktop / Compose v2。正式分发所需的签名、公证、生产存储和邮件投递应在对应环境独立验证。

## 快速开始

### 启动桌面端，使用本机模式

```sh
git clone https://github.com/hanzeal-ai/MarkFix.git
cd MarkFix
pnpm install --frozen-lockfile
pnpm --filter @markfix/database db:generate
pnpm --filter @markfix/desktop rebuild:native
pnpm dev:desktop
```

在登录页选择「仅在本机使用」，即可开始创建项目和标注网页。更多开发配置与 macOS 构建步骤见[本地开发指南](docs/local-development.md)。

### 启动本地协作服务

在仓库根目录的另一个终端执行：

```sh
docker compose up --build -d
docker compose ps
```

- 官网与管理后台：<http://localhost:4311>。
- API 健康检查：<http://localhost:4310/v1/health>。
- 开发账号：`admin@markfix.local`，密码：`markfix-admin`。

桌面开发环境默认连接本地服务，选择「云端协作」后登录。Compose 使用开发数据库同步和示例凭据，仅用于本地开发；生产部署见[部署指南](docs/aliyun-deployment.md)。

## 项目结构

| 路径                                                  | 职责                                |
| ----------------------------------------------------- | ----------------------------------- |
| `apps/desktop/`                                       | Electron 桌面端、网页标注与本机数据 |
| `apps/dashboard/`                                     | 官网与协作管理后台                  |
| `apps/api/`                                           | 云端 API、认证与业务服务            |
| `apps/cli/`                                           | CLI 与研发工具接入                  |
| `packages/contracts/`                                 | 共享 API 和数据契约                 |
| `packages/database/`                                  | Prisma 数据模型与数据库访问         |
| `packages/annotation-model/`、`packages/anchor-core/` | 标注模型与网页定位逻辑              |
| `packages/api-client/`、`packages/ui/`                | 共享客户端与 UI 组件                |
| `packages/testkit/`                                   | 测试支持                            |

业务契约与当前实现边界见[当前契约](docs/current-contract.md)。目标网页的隔离与访问规则见[浏览器安全边界](docs/security/browser-boundary.md)。

## 开发与验证

在仓库根目录执行项目检查：

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` 验证各包构建，桌面安装包的打包和发布另按平台文档执行。修改标注定位、回放或页面交互后，还需在真实 Electron 窗口中验证相关行为。

## 文档

| 场景                        | 文档                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| 本机使用、开发与 macOS 构建 | [本地开发指南](docs/local-development.md)                                                  |
| Windows 安装与打包          | [Windows 指南](docs/windows-desktop.md)                                                    |
| CLI 安装、授权与命令        | [CLI 使用说明](apps/cli/README.md)                                                         |
| 业务与数据边界              | [当前契约](docs/current-contract.md)                                                       |
| 网页隔离与标注架构          | [安全边界](docs/security/browser-boundary.md)、[架构决策](docs/adr/0001-target-overlay.md) |
| 服务部署                    | [部署指南](docs/aliyun-deployment.md)                                                      |
| 桌面发布与更新              | [GitHub 发布](docs/github-desktop-release.md)、[应用更新](docs/desktop-updates.md)         |

## 反馈与贡献

通过 [Issues](https://github.com/hanzeal-ai/MarkFix/issues)反馈问题时，请说明系统、运行版本、使用模式、复现步骤及预期与实际结果。涉及网页标注时，请提供可公开访问的复现页面；分享截图和日志前请移除敏感信息。

提交改动前，请阅读 [项目规范](AGENTS.md)，复用共享契约，并运行相关测试和项目检查。在 Pull Request 中说明行为变化、验证结果，以及涉及界面时的复现或验证方式。不要提交生成的构建产物或本机数据库。

## 许可证

`package.json` 当前声明为 `UNLICENSED`，仓库尚未提供开源许可证。本文档的结构不代表授予使用、修改或再分发的开源许可。
