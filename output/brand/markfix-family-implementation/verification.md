# MarkFix 品牌统一验证

2026-09-16，Node 24.19.0、pnpm 11.25.0，当前工作目录本地验证。

采用已选定的交叠 M，网站、后台、登录注册、桌面主窗口和子窗口采用 CarryOn 新版中性主题。更新静态 SVG、favicon、macOS ICNS 及官网三张产品图。用户标注颜色、业务状态色和业务规则保持不变。

## 已验证

- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
- `pnpm --filter @markfix/desktop exec electron scripts/smoke-account-ui.mjs`：登录注册、侧边栏、导航、原生子窗口、错误提示与取消操作。
- `MARKFIX_PREVIEW_SMOKE=1 pnpm --filter @markfix/desktop exec electron scripts/smoke-account-ui.mjs`：滚动、路由变化、标注回放、页面隔离、侧栏拖拽与恢复。最后一次在目标页中性色变更后重新运行。
- `MARKFIX_AUDIT_SURFACES=1 pnpm --filter @markfix/desktop exec electron scripts/smoke-dashboard-components.mjs`：官网、文档、价格、下载、法律页面、账户入口、后台总览、项目、用户、弹窗以及加载/空/失败/只读状态。
- `MARKFIX_MARKETING_SMOKE=1 pnpm --filter @markfix/desktop exec electron scripts/smoke-dashboard-components.mjs`：交互演示、批注编辑、截图、页面隔离、下载状态和移动端布局。
- 本地视觉检查：上述主要页面及子窗口截图、新图标、黑白反色、网站产品展示图。
- macOS 图标由现有 `generate-mac-icon.sh` 生成并检查；静态图标避免掩膜栅格化锯齿。

测试使用临时本地用户目录和测试 API，不操作真实账户。产品图取自当前 Electron 界面与当前本地网站，主窗口和隔离目标页分别捕获，按原生视图的实际坐标合成；未使用概念图或绘制的假界面代替截图。

## 验证边界

属于本地界面和测试数据验证，未进行生产部署、安装包签名公证或线上业务验收。账户邮件发送、真实跨端同步等外部服务能力不由本次主题验证证明。

主题权威源：`packages/ui/src/styles.css`；Logo React 源：`packages/ui/src/components/markfix-logo.tsx`。回退时仅恢复本次品牌、样式和图片变更，保留任务开始前的用户改动。
