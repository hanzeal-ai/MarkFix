# Windows x64 桌面试用版

## 使用者安装与更新

适用目标为 Windows x64（Intel / AMD 64 位），建议先在 Windows 11 实机验收。当前不提供 Windows ARM64 原生包。

1. 从下载页选择 Windows，取得 `MarkFix-<版本>-windows-x64-setup.exe`。下载地址尚未配置时，页面显示“Windows 安装包待发布”，不会返回 Mac 安装包。
2. 运行安装器，选择当前用户的安装目录。无需安装 Node、pnpm、Docker 或另建数据库。
3. 启动后选择“仅在本机使用”，项目与标注保存在 Electron 用户数据目录中的 SQLite。云端协作需要可访问的正式 API 和账号。
4. Windows 更新采用手动安装：点击应用中的更新按钮打开下载页，下载完成后退出 MarkFix，再运行新版安装器覆盖原目录。保持同一 Windows 账号、应用标识和安装方式；不要先删除用户数据目录。卸载器默认保留用户数据。

试用工作流产物未配置 Windows 代码签名，不能视为已经签名或可无提示安装的正式发行版。官网明确标注未签名试用包；Windows 可能显示发布者或 SmartScreen 提示。正式签名发行仍需证书与实机验收。

## 构建与下载产物

提交到 main 后，CI 完成测试与官网部署，随后 **Desktop downloads** 自动在 Windows 和 macOS runner 上分别构建、校验安装包。Windows 执行静默安装、启动、原生 SQLite 与重启持久化检查。成功产物由服务器再次校验并放到官网的不可变地址：

`https://markfix.hanzeal.com/downloads/windows/<版本>/<提交号>/MarkFix-<版本>-windows-x64-setup.exe`

用户只需访问 [官网下载页](https://markfix.hanzeal.com/download?platform=win32)。下载不需要 GitHub 账号。CI Artifact 保留 14 天供排障，官网文件独立持久保存。Windows 与 macOS 任一平台失败，不阻止另一个已通过的平台发布。

本地 Windows 构建命令（PowerShell，仓库根目录）：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @markfix/database db:generate
pnpm --filter @markfix/desktop package:win --config.directories.output=release
```

构建工具会为目标 Electron / Windows x64 重建 `better-sqlite3`。若无法取得预编译二进制，构建机需要 Python 和 Visual Studio C++ Build Tools；普通使用者不需要这些工具。不要把 Mac 的原生模块复制到 Windows 包中。开发启动前使用 `pnpm --filter @markfix/desktop rebuild:native` 重建 Electron 原生模块。

安装图标 `apps/desktop/build/icon.ico` 从现有 `docs/brand/logo/markfix-logo-icon.svg` 渲染，包含 16、32、48、64、128、256 像素 PNG 图层。

## 下载和版本配置

API 继续使用同一个 `ClientPolicyService` 和既有 `clientPolicySchema`。`GET /v1/client-policy?version=0.1.0&platform=win32&arch=x64` 返回 Windows 对应策略：

- `MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL`：实际已发布的 HTTPS `.exe` 地址，禁止 URL 内嵌凭据。未配置时不返回下载链接。
- `MARKFIX_WINDOWS_MINIMUM_DESKTOP_VERSION`：默认 `0.1.0`。
- `MARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION`：默认等于 Windows 最低版本。

Mac 保留既有版本配置和 Apple Silicon 下载变量 `MARKFIX_DESKTOP_DOWNLOAD_URL`；不把该地址分配给 Windows、Intel Mac 或其他平台。Windows 推荐版本不跟随 Mac 发布自动提升。`/v1/desktop-updates` 仍仅服务 Mac 原生更新器，Windows 不调用它。

Windows 应用中的更新按钮沿主窗口受信 IPC 入口读取新策略，仅打开固定服务源的 `/download?platform=win32`，不接受 renderer 传入地址，不自动下载执行代码、不退出应用。有效编辑仍先沿既有路径保存；保存失败不会启动更新。

发布顺序：先在 Windows 验收安装包，再经授权上传不可变的 HTTPS 版本文件，确认匿名下载及 SHA-256，最后配置下载地址和推荐版本。只在必要时提高最低版本。API 容器必须实际收到这些变量；生产 Compose 使用 `MARKFIX_ENV_FILE`，本地 Compose 则需要显式传入。配置本身不代表已经发布。

## 验证、影响与恢复

风险 R2：涉及客户端版本公共接口、平台适配与安装交付。变更不修改数据库 Schema、远程页面隔离或权限契约，不新增依赖。Mac 试用包与 Windows 均手动更新；Windows 使用独立平台参数，但版本决策仍由同一服务负责。

自动化覆盖：平台版本与下载地址分流、无包及不安全地址拒绝、Windows Ctrl/Alt 快捷键、手动更新的重复点击/离线/无新版/打开浏览器失败，以及真实渲染页面的下载状态。Windows 工作流中的已安装程序检查覆盖启动、预加载、原生 SQLite 和重启持久化；这些检查只有实际在 Windows 上执行成功后才算目标平台证据。

发布前仍须在干净 Windows 机器验收：

- 安装、桌面和开始菜单入口、普通用户权限、中文及空格路径、卸载。
- 主窗口和所有子窗口的关闭/最小化、Ctrl/Alt 快捷键，以及 100%/125%/150% 显示缩放。
- 元素批注和截图标记、滚动定位、路由变化、保存后重启回放、不同页面隔离。
- 云端登录与协作、断网本机使用、旧版覆盖更新后的数据保留。

若新包异常，停止分发并恢复 Windows 推荐版本或移除下载地址；不影响 Mac 版本策略。已安装用户保留数据并使用更高版本的修复包，不以删除用户数据作为恢复方法。代码回退可撤回本次变更，无数据库迁移需要回滚。

自动发布由 `.github/workflows/desktop-release.yml` 控制；服务器发布器 `infra/aliyun/publish_desktop.py` 验证提交、文件名、大小、SHA-256 和匿名 HTTPS 下载，最后切换 API 策略。仅当前部署提交可发布；已存在的版本/提交目录不能覆盖不同字节。修改策略前备份 app.env；API 验证失败时恢复备份并重启 API。部署和发布共用文件锁。

macOS Apple Silicon 采用同样流程，下载地址为 `/downloads/macos/<版本>/<提交号>/MarkFix-<版本>-arm64.dmg`。默认 trial 构建只做 ad-hoc 完整性签名，无 Apple 身份签名或公证，明确标注未签名试用版；构建时启用手动更新，服务端也禁用试用版原生更新 feed。Intel Mac 暂无安装包。

取得证书并完成正式更新验收后，才将仓库变量 `MARKFIX_MACOS_RELEASE_MODE` 改为 `signed`，并配置 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。signed 构建缺少任一凭据会失败，不会降级为试用包。

验证范围：自动检查覆盖下载安装、启动、SQLite 持久化与下载页分流；不同显示缩放、真实旧版覆盖升级、Windows 批注全流程仍需干净实机验收。正式签名、公证和自动升级不属于试用包的完成状态。

## 标注保存诊断

保存期间，页内提交按钮显示“保存中…”，并阻止重复点击。缺少页面上下文、选区失效、保存异常和预览打开失败会显示系统对话框；失败提示中包含日志的完整路径。

`annotation-save.log` 写入 Electron 的应用日志目录，单文件达到 1 MiB 后轮转，保留当前文件和上一份 `.1` 文件。日志记录时间、应用版本、平台、提交/保存/预览阶段及可获得的 HTTP 状态码，不记录备注、网址、截图、令牌或原始错误文本。

排查时对照最后一条阶段：`inline-submit` 表示主进程收到页内提交；`submit-received` 表示工作区收到提交；`*:received` 表示进入保存处理；`*:cloud-start` 或 `*:local-start` 表示开始对应存储操作；`*:saved` 表示保存完成；`preview-opened` 表示已请求打开预览。`missing-context`、`stale-page` 等代码对应可见的失败提示。日志文件中没有提交记录时，还需要检查页内按钮和输入法状态，不能据此认定服务器故障。
