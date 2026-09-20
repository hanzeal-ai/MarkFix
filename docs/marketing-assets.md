# 官网桌面端展示素材

2026-09-17 更新。官网当前使用的元素批注、截图工具与提交预览三张图片来自当前 Electron 构建，使用隔离用户目录和设计工作台演示网页，不包含真实客户数据。

| 文件                     | 当前桌面端场景                     |
| ------------------------ | ---------------------------------- |
| `element-annotation.png` | 元素定位、页内备注和提交按钮       |
| `screenshot-editor.png`  | 截图选区、标记工具栏与红色矩形标记 |
| `project-management.png` | 项目侧栏、本地项目与网站工作区     |
| `annotation-review.png`  | 提交窗口、勾选记录与截图预览       |

文件位于 `apps/dashboard/public/marketing/`。主窗口截图由同一窗口的 shell 与可见网站视图实时捕获，按 Electron 的实际视图边界合成；提交窗口直接捕获。被标注页面由 `apps/desktop/scripts/marketing-fixture.html` 提供，明确标记为示例数据；桌面界面来自实际构建。未被当前官网引用的 project-management 与 analytics-overview 图片保留原素材。

官网在线体验复用正式官网的导航、首页和定价组件，不维护另一份示例文案或价格。体验仅在浏览器内模拟元素批注和截图标记；不会保存或上传记录，也不会创建本地文件。真实网站访问、本地持久化和云端提交由桌面端提供。

下载页读取既有 `/v1/client-policy` 发布策略中的版本和 `downloadUrl`，不单独维护版本清单。只有合法 HTTPS 下载地址才显示可用入口；未配置、获取失败分别展示状态。公开安装包仍需发布负责人提供并验证，不把本地构建等同于已签名、公证或公开发布。

验证（先构建 dashboard）：

```sh
MARKFIX_MARKETING_SMOKE=1 pnpm --filter @markfix/desktop exec electron scripts/smoke-dashboard-components.mjs
```

此检查覆盖图片加载、备注字号、编辑、页面隔离、截图选区、删除、下载状态、文档、定价以及移动端基本操作；输出实际页面截图供视觉复核。

重新采集（先构建 desktop）：

```sh
MARKFIX_MARKETING_ASSETS=1 MARKFIX_SMOKE_OUTPUT_DIR=/tmp/markfix-site-assets pnpm --filter @markfix/desktop exec electron scripts/smoke-inline-notes.mjs
```

检查输出的 `element-inline.png`、`capture-inline.png`、`annotation-review.png`，分别替换官网的 `element-annotation.png`、`screenshot-editor.png`、`annotation-review.png`。采集复用实际交互烟测，覆盖页内输入、Enter 提交、预览、滚动、切页与回放，不调用云端服务。
