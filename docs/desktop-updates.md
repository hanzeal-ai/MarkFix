# 桌面自动更新发布

本文描述已签名 macOS 正式包的原生自动更新。macOS 未签名试用包继续手动安装；Windows x64 使用 NSIS 自动更新，自动发布流程与验收见 [Windows 桌面试用版](windows-desktop.md)。

## 产品行为与范围

只有服务端版本策略确认存在推荐或强制升级时显示「更新」按钮；当前版本已满足推荐版本或版本信息尚未取得时隐藏，点击后确认无新版也会隐藏。用户点击一次「更新」，客户端保存有效的未完成批注，然后检查、下载并自动安装重启。无新版会恢复界面并提示；保存或更新失败会恢复操作并提示重试。截图缺少必填描述等不能保存的状态会停止更新，不能以丢失内容换取自动重启。当前仅支持已安装的 macOS 应用，开发进程不执行安装。

使用 Electron 自带 `autoUpdater`（Squirrel.Mac），不增加生产依赖、不启动浏览器、不要求用户手动运行安装包。通栏账号底栏保持不变。

## 唯一版本来源与更新协议

API 的 `ClientPolicyService` 负责推荐版本、最低版本和版本比较。`GET /v1/desktop-updates?version=0.1.0&platform=darwin&arch=arm64` 为公开的原生更新协议端点，不读取用户业务数据：

- 当前版本不低于推荐版本：HTTP 204 空响应，不重装、不降级。
- 有新版：HTTP 200 JSON `{ "url": "https://…/MarkFix.zip", "name": "0.2.0" }`。
- 不支持的平台、架构或无效版本拒绝请求；安装包未发布或配置不安全时失败，不能返回虚假的“已是最新版”。
- MARKFIX_DESKTOP_MAC_DISTRIBUTION=trial 时拒绝提供原生更新包。
- 禁止缓存此响应。包必须是 HTTPS ZIP，不允许内嵌账号密码。

API 进程配置：

- `MARKFIX_RECOMMENDED_DESKTOP_VERSION`：已发布安装包的真实版本。
- `MARKFIX_MINIMUM_DESKTOP_VERSION`：最低可用版本，不得高于推荐版本。
- `MARKFIX_DESKTOP_MAC_ARM64_UPDATE_URL`：Apple Silicon ZIP。
- `MARKFIX_DESKTOP_MAC_X64_UPDATE_URL`：Intel ZIP；未发布此架构时留空，不能指向 ARM 包。

`MARKFIX_DESKTOP_DOWNLOAD_URL` 仍是既有客户端策略的可选下载地址字段，自动更新不使用它。更新端点依据同一版本策略生成 feed，不单独维护另一份版本清单。

## 正式包与发布顺序

1. 准备 Developer ID Application 签名身份和 Apple 公证凭据，保存在系统钥匙串或 CI Secrets 中。初装包和更新包必须使用可相互验证的同一签名身份，保持 appId `com.markfix.desktop`。不能把未签名或临时签名演示包视为自动更新验收基线。
2. 更新 `apps/desktop/package.json` 的版本号，将共享服务配置中的 `productionOrigin` 设置为正式 HTTPS 地址，运行 `pnpm --filter @markfix/desktop package:mac:release`。此命令要求签名、启用 hardened runtime 和公证，不会上传产物；指定目标架构须使用 electron-builder 的 `--arm64` / `--x64` 参数执行同等正式构建。普通 `package:mac` 仅用于已有演示打包。
3. 验证 DMG 与 ZIP 中的应用签名、公证和实际版本。将 ZIP 上传到不可变、带版本和架构的 HTTPS 地址，验证匿名下载与完整文件大小。不得覆盖一个已发布版本的安装包。
4. 先部署新增 API 端点并配置包地址，确认下载可用，再提升推荐版本。只在确有兼容性要求时提高最低版本。阿里云 Compose 通过 MARKFIX_ENV_FILE 将发布器更新的策略传入 API 容器。
5. 用已签名的旧版正式安装包进行一次真实升级：点击后不再操作，确认旧进程退出、新进程自动打开、版本提升，LOCAL 数据和 CLOUD 标注仍可访问。分别验证网络失败、错误签名、当前版本、ARM/Intel 路由。

首次使用自动更新仍须先分发包含更新器的已签名基础版；已经安装且没有更新器的旧包不能凭服务端配置自行获得此能力。

## 影响、恢复和交付门禁

风险等级 R2：本变更会下载代码、关闭应用并替换安装。renderer 不能传入更新地址；仅主窗口可以启动或读取更新状态，远程网站不能调用更新入口。HTTPS 检查保留，包校验由原生更新器实施，不绕过签名。用户预先点击更新是本次下载与自动重启的授权。

已保存批注仍沿现有 LOCAL/CLOUD 权威路径保存；没有数据库 Schema 或迁移变更。有效编辑会在检查前自动保存，保存失败不启动更新。退出沿现有 `before-quit` 清理逻辑关闭数据库，已有 outbox 中断恢复行为不变。

出错时保留当前安装并恢复界面。发布坏版本时先停止向未升级用户提供该版本（恢复推荐版本或撤下包地址）；已升级用户不自动降级，使用更高版本的修复包。保留旧签名安装包和现有数据备份；不要删除用户数据目录作为“回滚”。

本地状态机和 HTTP 测试不能替代原生签名校验、安装、重启、数据保持的正式环境证据。发布前必须完成独立审查和人类发布批准；未配置证书、HTTPS 包、未执行真实升级时，仅可报告实现及模拟验证完成。

协议参考：[Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater)、[Squirrel.Mac Server Support](https://github.com/Squirrel/Squirrel.Mac#server-support)。
