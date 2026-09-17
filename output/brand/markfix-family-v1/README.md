# MarkFix / CarryOn 品牌系列 Logo

推荐 `01-ribbon-m`：圆头双拱构成 M，中央丝带交叠使用透明间隔，与 CarryOn 当前 `logo.svg` 的视觉语法一致。02 为更直接的折线 M，03 为批注与勾选闭环。

## 文件

每个方向提供 symbol（透明独立符号）、horizontal（横版）、stacked（上下组合）、app（圆角底应用图标），分别有 black、white、green，共 36 个 SVG。`preview.svg` / `preview.png` 为对比展示，不用于正式 Logo。

## 使用

- 黑色 #000000 为主色，白色 #FFFFFF 为反白；绿色 #176B50 取自 CarryOn 现有应用图标，作为同系列可选色。
- 独立符号采用 100 × 100 坐标、14 单位笔画、22 单位交叠遮罩，留白透明；避免添加阴影、渐变或彩色细节。
- 四周至少保留 14 单位安全间距；标准符号建议 24 px 起，16 px 已提供实际尺寸预览，但复杂交叠更适合 24 px 以上。
- 横版建议 120 px 起；应用图标导出应遵循各平台圆角裁切规则。
- white 的 symbol / horizontal / stacked 为透明白字，放在深背景；app-white 为白底黑符号。
- 字标使用 Helvetica Neue / Helvetica / Arial。SVG 符号完全矢量；字标保留可编辑文本，跨平台精确交付或印刷前需转曲。
- 内联多个同名 SVG 时，应给遮罩 ID 加实例前缀，避免 DOM ID 冲突；通过 img 引用无此问题。
- 可使用浏览器或矢量编辑器导出 PNG。所有符号保留 SVG 原稿，预览 PNG 仅供选型。

## 范围与验证

本次为品牌设计资产，没有修改 React、Electron、favicon 或应用内现有 Logo。已检查 SVG XML、引用完整性和本地栅格预览；不代表应用集成或真机验收。
