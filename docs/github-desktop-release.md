# GitHub 桌面发布

在现有 CI 的 **Run workflow** 中选择 `main`，勾选 `release_desktop`。全项目验证通过后，macOS 任务构建 Apple Silicon DMG 和 ZIP，验证应用签名、公证、版本与包完整性，再将两个包及 SHA256SUMS.txt 上传到草稿 Release；上传成功后发布。服务端原有镜像发布与部署仍按原流程执行。

普通 push、PR 和未勾选选项的手动运行不会发布桌面包。桌面版本取自 `apps/desktop/package.json`，标签为 `desktop-v<version>`，定位到本次通过验证的提交。已存在的标签拒绝覆盖；下次发布必须提升版本号。目前只发布稳定版本和 arm64 架构。

## 仓库配置

- `packages/contracts/src/service-config.ts` 的 `productionOrigin`：正式 HTTPS 网站/API 地址，与服务端共用。
- Actions Secrets `CSC_LINK`：Developer ID Application 签名证书的 base64 编码 P12。
- `CSC_KEY_PASSWORD`：P12 密码。
- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`：Apple 公证凭据。

任务使用已有 `package:mac:release`，不允许缺少证书时降级为未签名发布。GitHub 自带的 `GITHUB_TOKEN` 仅在该任务获得 `contents: write`，无需另配 GitHub PAT。

## 下载与恢复

本仓库当前为私有仓库，Release 附件仅授权用户可访问，不能直接作为官网匿名下载地址。公开分发须另行授权配置公开发布仓库或对象存储，不得为解决下载问题把源码仓库改为公开，也不得把 GitHub Token 放入官网。

公开下载可用后，按 `docs/desktop-updates.md` 配置 `MARKFIX_DESKTOP_DOWNLOAD_URL`（DMG）与架构对应的 ZIP 地址，再提升推荐版本。本流程不修改服务器版本策略，也不触发客户端自动升级。

发布失败可能保留草稿或标签。先检查 GitHub Release 和附件状态：完整的草稿可经人工核验后发布；不完整的草稿需经授权清理后重跑。已发布版本不得替换附件，修复时发布新版本。暂停后续桌面发布只需不勾选 `release_desktop`。

本地只能验证流程配置与命令；成功上传、公证和安装须由配置凭据后的 CI 运行及目标 Mac 实测确认。
