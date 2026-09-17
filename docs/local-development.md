# 本地使用、云端协作与开发

## 先选择数据存放方式

| 方式               | 数据位置                                   | 团队与 CLI                                                  |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| 桌面端「仅本机」   | Electron 用户数据目录中的 `markfix.sqlite` | 无需云端账号；CLI 使用 `--local` 读取、领取和回写已提交标注 |
| 桌面端「云端协作」 | 所连接服务的数据库与截图存储               | 按项目成员、角色及 CLI 授权范围访问已提交标注               |
| 本机自建服务       | 本机 PostgreSQL 与附件卷                   | 属于服务端模式，桌面端仍选择「云端协作」，CLI 连接本地 API  |

在登录页选择「仅在本机使用」即可进入，无需云端账号或启动 API。使用 CLI 时需保持桌面端运行。切换模式或服务不会自动上传、迁移已有本机标注。源码构建不会改变这些边界。

## 只使用本机桌面与 CLI

1. 启动桌面，在登录页选择「仅在本机使用」。不需要启动 Docker、API 或 PostgreSQL。
2. 创建本机项目，完成标注后，在预览窗口勾选记录并提交。未提交草稿不会被 CLI 领取。
3. 安装 CLI 后，在代码仓库执行以下命令；本机 CLI 自动连接桌面，对所有本地项目拥有完整访问权限，无需配置或手动授权。

```sh
markfix projects list --local
markfix repo register --local
markfix projects resolve --local
markfix issues list --project PROJECT_ID --local
```

项目三点菜单的「绑定项目」可选择本机 CLI 上报的仓库。将 `PROJECT_ID` 替换为返回的项目 ID。要求 Codex 使用本机模式，并在每条 MarkFix 命令上添加 `--local`；领取、续租和结果 JSON 与 [CLI 手册](../apps/cli/README.md) 相同。

保持桌面运行；关闭时接口不可用，重新启动后自动连接。结果只写回本机，桌面批注面板显示修复完成或失败原因，重新聚焦或等待最多 30 秒刷新。云端后台不显示本机记录。本机 CLI 无需授权、钥匙串或令牌，不限制项目范围。CLI 的本机配置和待同步结果保存在其数据目录的 `local` 子目录，与云端隔离。

默认发现文件是 `~/.markfix-desktop/agent.json`，权限仅限当前系统用户，不要分享或手动修改。开发时如需隔离多个桌面测试配置，在桌面与 CLI 两端设置同一个 `MARKFIX_LOCAL_AGENT_FILE` 绝对路径。CLI 不直接打开 SQLite；接口只监听 127.0.0.1，不对局域网提供服务。

## 使用已有云端服务

1. 使用连接到该服务的桌面安装包，登录账号。
2. 创建或加入云端项目，完成标注后提交。
3. 安装 CLI，在待修复的 Git 仓库执行 `markfix projects list --server https://你的服务地址`。
4. CLI 自动打开浏览器；核对授权码并选择项目，批准后命令继续返回项目列表。
5. 在桌面项目三点菜单中绑定 CLI 上报的仓库，再由 Codex 读取和回写标注。

服务地址必须是 API 的 HTTPS origin，不包含 `/v1`。远程 HTTP 不能用于 CLI 授权。详见 [CLI 使用手册](../apps/cli/README.md)。

## 在开发机器启动完整服务

以下命令在仓库根目录执行，需要 Docker Desktop / Compose v2。该配置仅供开发，使用示例账号，并在启动时执行 `prisma db push`；不要连接生产数据库。

```sh
docker compose up --build -d
docker compose ps
```

| 入口                 | 地址                            |
| -------------------- | ------------------------------- |
| 官网、文档、管理后台 | http://localhost:4311           |
| API 健康检查         | http://localhost:4310/v1/health |
| 兼容性测试页面       | http://localhost:4312           |

开发账号：`admin@markfix.local`，密码：`markfix-admin`。该账号仅用于本地开发。

```sh
docker compose logs -f api dashboard
docker compose down
```

停止容器会保留数据库及附件卷。不要为日常重启删除卷。

### 启动桌面源码

需要 macOS、Node.js 24、根 `package.json` 中指定的 pnpm（当前 11.25.0），以及 Xcode Command Line Tools。服务健康后执行：

```sh
pnpm install
pnpm --filter @markfix/database db:generate
pnpm --filter @markfix/desktop rebuild:native
pnpm dev:desktop
```

开发桌面默认连接上述本地服务。桌面默认支持 HTTP 和 HTTPS 网站；CLI 的授权传输要求不变。

只需本机保存标注时，可跳过上面的 Docker 服务启动，完成依赖安装后直接启动桌面，选择「仅在本机使用」。本机操作不要求云端账号。

### 在本地自建服务使用 CLI

先在桌面选择「云端协作」，创建项目并提交标注。然后从源码打包 CLI：

```sh
pnpm --filter @markfix/cli build
mkdir -p artifacts
pnpm --filter @markfix/cli pack --pack-destination "$PWD/artifacts"
npm install -g ./artifacts/markfix-cli-0.1.0.tgz
cd /path/to/your-repository
markfix projects list --server http://localhost:4310 --allow-local-http
```

安装不授权；最后一个命令首次运行时打开本地管理后台的授权页面。登录开发账号、核对授权码、选择项目并批准。macOS 使用钥匙串；Linux / Windows 首次命令另加 `--credential-store file`。浏览器无法打开时添加 `--no-browser`，手动访问终端链接。

```sh
markfix repo register
markfix projects resolve
markfix issues list --project PROJECT_ID
```

将 `PROJECT_ID` 换成服务返回的项目 ID。没有绑定时使用 `projects list` 选择项目。仅本机项目不会出现在这里。修复结果经服务确认后才能视为同步完成，断网暂存结果用 `markfix sync` 补传。

同时使用多个服务时，为各自配置不同的 `MARKFIX_CLI_HOME`，并在该服务的每次命令中保持同一目录。例如 `MARKFIX_CLI_HOME="$HOME/.markfix-dev" markfix projects list --server http://localhost:4310 --allow-local-http`。不要通过改配置文件切换已授权服务。

## 构建 macOS 应用

开发调试用 `pnpm dev:desktop`。只验证可编译产物使用：

```sh
pnpm --filter @markfix/desktop build
```

产物位于 `apps/desktop/out`，不是可分发安装包。生成供本机验证的未签名 DMG / ZIP：

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @markfix/desktop package:mac
```

安装包默认输出到 `apps/desktop/dist`。打包使用生产服务配置；要连接自己的服务，在构建时指定同时承载官网与 `/v1` API 的统一入口：

```sh
MARKFIX_SERVICE_ORIGIN=https://markfix.example.com CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @markfix/desktop package:mac
```

替换示例地址后再执行。该环境变量在构建时写入应用；仅修改运行环境不会改变已构建包。开发环境的 4311 是 Vite 官网端口，并不是统一 API 反向代理入口，不能直接当成上述生产入口。

未签名包只用于本机验证，不代表已完成签名、公证或发布。正式发行使用 `package:mac:release`，需要独立配置签名、公证与更新服务；本指南不执行发布。

## 验证源码改动

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
