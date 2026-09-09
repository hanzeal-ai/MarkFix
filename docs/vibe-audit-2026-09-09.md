# MarkFix Vibe Coding 审查与优化记录

## 结论与范围

本轮完成全仓文件清单、相对导入依赖扫描、重点职责/契约/副作用审查，并实施下表中的明确问题修复。**本轮改动可以有条件接受；全项目状态为 partially verified，不宣称所有文件、运行环境和业务路径已经全面合规。**

审查基于 `4d6e42a4e9b54718916de3a6635f1b8d587baf50` 之上的未提交工作树。开始时已有大量 shadcn、预览合并、编号与 Resizable 改动；这些保留，不能把整个工作树差异都归于本次审查。未提交、推送、部署或执行生产数据操作。

清单见 [逐文件清单](vibe-audit-2026-09-09-inventory.json)：351 个未被忽略的现存文件，其中 235 个 TS/TSX/MJS 文件；包含文件哈希、行数、导入和验证等级。清单不是逐文件语义验收证明。相对静态导入图未发现循环；这不覆盖路径别名、动态导入或运行时消息环。

依据：项目 `AGENTS.md`、全局 Vibe Coding 标准、`docs/vibe-review-checklist.md`、浏览器隔离文档与 target-overlay ADR。扫描覆盖应用、共享包、测试、脚本、基础设施及文档；深入语义审查集中于导航、后台页面/契约、上传/提交/清理、旧数据迁移和 Electron 布局生命周期。其余文件不能仅凭 lint/build 判定业务逻辑正确。

## 实施内容

| 问题                                                             | 最终修改                                                                                                                                                                               | 风险与证据                                                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `ProjectNavigation` 混合工具栏、侧栏、新项目表单和快捷网站持久化 | 删除聚合文件，按状态/副作用所有者拆成 `project-navigation/` 中的 HeaderNavigationControls、ProjectSidebar、NewProjectPage、WebsiteShortcuts 与数据模块；消费者直接导入，无兼容转发文件 | R1；桌面偏好/快捷网站测试；真实 Electron 新建、侧栏、账户菜单与快捷网站增改删                       |
| 缓存中的坏快捷网站 URL 可在渲染 Logo 时抛错                      | 在读入持久化数据时过滤无效/非 HTTP(S) URL；无协议地址规范化；不改写已经合法的旧地址                                                                                                    | R1；损坏数据和数量上限测试                                                                          |
| `AdminViews` 同时承载概览、项目和用户邀请状态                    | 拆分 OverviewView、ProjectsView、UsersView；邀请 mutation 留在 UsersView；两个真实消费者共享 ProjectLogo                                                                               | R1；后台行为与视觉验证                                                                              |
| 商业标注输入及响应形状分散在 API 和 dashboard                    | 移入 `packages/contracts/src/commercial.ts`；API 输入校验与前端 DTO 使用同一契约；数据库日期投影保留在后端                                                                             | R2；独立审查逐字段确认迁移不改变语义；schema 测试保留 REJECTED 查询/编辑区别                        |
| 已被顶层路由拦截的旧登录分支                                     | 删除 WebRoot 中不可达分支及单行 AdminLogin 别名                                                                                                                                        | R1；现有 route 测试与账户页面打开验证                                                               |
| 过期清理可先删掉并发 finalized 的截图                            | 提取 `expired-submission-cleanup.ts`，先以 id/status/expiresAt 条件删除数据库记录，确认成功后才删 PNG                                                                                  | R2；独立审查、单元测试、真实 PostgreSQL 并发验证                                                    |
| DB/file 非原子操作失败后可能残留 PNG                             | 增加默认只读的离线 orphan 修复工具；双查 Artifact 和 Report 引用；数据库错误时零删除；部分文件失败可重跑                                                                               | R2；[维护说明](artifact-maintenance.md)、真实权限失败与迟写上传 fixture、负向测试；不是在线自动恢复 |
| 两个 API 同时启动可能重复迁移同一旧标注                          | 在创建 Report 的同一事务中 deleteMany 抢占旧行；失败回滚；失去抢占时必须核验目标 project 和 submission provenance                                                                      | R2；双 worker、创建失败回滚重试、缺失/错误来源拒绝的 PostgreSQL 检查                                |
| 异步侧栏截图返回时窗口可能已销毁                                 | 布局入口检查 destroyed；截图前固定 window/view，返回后再次核对引用和存活状态                                                                                                           | R1；原 smoke 复现退出异常，修复并重建后不再出现该异常                                               |
| 后台标注查询失败同时显示“没有符合条件的标注”                     | 空态仅在请求非失败且无记录时出现                                                                                                                                                       | R1；错误响应 fixture 验证错误提示出现且空态不出现                                                   |

## 未机械拆分的判断

- `AnnotationWorkspace` 已有 session、capture editor、element editor 和 resize/presentation 边界；独立审查未发现仅凭行数需要继续拆分的证据。
- `main/index.ts` 与 `AppService` 仍承担较多协调职责。未来增改应优先沿 website-view 生命周期、submission/artifact/report 生命周期拆分，不能用几十个转发方法或大型参数包掩盖耦合。本轮优先修复已经复现的生命周期与数据一致性问题。
- target runtime 的 shadow DOM、原生事件和绘制是隔离网页的必要平台适配，不应把它强行换成 shadcn/React。
- shadcn 基础组件是 UI 原语；其大小、源码形式不是不合规依据。已有真实能力不再包装第二套无消费者抽象。
- 商业响应 DTO 的运行时校验、其他 API-client DTO 进一步归入 contracts，仍是边界增强候选；本轮没有以类型搬迁冒充运行时校验。

## 验证环境与证据

本机 macOS；Node 24、pnpm 11.25.0；Electron 本地构建、隔离临时 profile、假账户/接口 fixture。后台窗口 1280×900，桌面主窗与子窗按脚本创建尺寸（含 1440 宽主窗及 1040 宽审阅窗）；系统缩放 2x。后台 fixture 覆盖 ADMIN 与 REPORTER，公开页为匿名。桌面假登录绕过系统钥匙串，因此不代表真实 Keychain 验证。

真实数据库使用独立的 PostgreSQL 18 临时容器、空 `audit` 数据库、仓库已有 Prisma migration。没有使用现有用户数据库。测试自行创建/清理 workspace 与目录；两个本轮临时数据库容器均已停止。

可复跑入口：

- `apps/api/scripts/verify-maintenance.ts`：数据库并发与恢复；前置条件见维护说明。
- `apps/desktop/scripts/smoke-account-ui.mjs`：默认窗口/布局流；`MARKFIX_MENU_SMOKE=1` 验证菜单与快捷网站；`MARKFIX_PREVIEW_SMOKE=1` 验证滚动、切换页面、回放与隔离。
- `apps/desktop/scripts/smoke-dashboard-components.mjs`：`MARKFIX_AUDIT_SURFACES=1` 验证后台/公开/账户界面。原有 on-screen capture 在本机出现 UnknownVizError，改用 Electron offscreen rendering 后成功；它是渲染与交互证据，不是 OS 窗口层级证据。

关键日志：`/tmp/markfix-audit-maintenance-db.log`、`/tmp/markfix-audit-shortcuts3.log`、`/tmp/markfix-audit-flow3.log`、`/tmp/markfix-audit-preview-fixed.log`。预览修复后的日志只包含预期的无效 HTTPS 输入负向测试，不再出现 target-closed 或 Object-destroyed 退出异常。

## 用户界面覆盖

按 renderer entries、child-window-manager、routes、WebRoot 和公开页面中的体验入口重新发现界面。以下状态只针对所列证据，不延伸为完整生产路径验收。

| 界面                                             | 状态               | 证据与限制                                                                                                             |
| ------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 主窗口浏览、元素批注、截图、合并预览             | verified           | `/tmp/markfix-audit-preview-fixed/unified-preview.png`；两侧拖拽/键盘缩放/收起恢复、跨模式回放、滚动、页面隔离行为通过 |
| 主窗口空态、新项目、错误、删除确认、侧栏账户菜单 | verified           | `/tmp/markfix-audit-flow3`、`/tmp/markfix-audit-shortcuts3`；隔离本地项目；只删除测试数据                              |
| 设置通用与快捷键/订阅切换                        | partially verified | 菜单脚本验证键盘 Tab 切换；设置截图可见；未验证真实付费/升级流程                                                       |
| 保存标注审阅                                     | verified           | `/tmp/markfix-audit-flow3/review.png`，等加载完成后检查真实内容                                                        |
| 截图预览                                         | verified           | `/tmp/markfix-audit-flow3/capture-preview.png`；fixture 图像，无生产图片存储声明                                       |
| 全局/项目历史                                    | verified           | `/tmp/markfix-audit-flow3/history.png` 与 `project-history.png`                                                        |
| 诊断面板的全部状态、OS 屏幕权限提示              | unverified         | 未运行完整权限授权/拒绝矩阵与诊断交互；不能用 native smoke 的其他通过项替代                                            |
| 官网、文档、定价、下载、隐私、条款               | partially verified | 本地路由打开并逐张检查首屏；长页全部滚动内容与法律文本有效性未验收                                                     |
| 在线体验区                                       | partially verified | 体验区渲染检查；完整 demo 截图编辑/导出流程未覆盖                                                                      |
| 登录、注册、验证邮件、找回/重置密码、接受邀请    | partially verified | 首屏及缺少 token 的状态已检查；未发送真实邮件或使用真实邀请                                                            |
| 账户设置                                         | partially verified | `/account` 通过 fixture 打开，注销按钮前置禁用状态可见；未执行真实账户导出/删除                                        |
| 后台概览、项目、用户、搜索空态                   | verified           | Progress 值、Table 行列、Avatar 与 Empty 行为断言通过，截图已检查                                                      |
| 项目抽屉、标注详情、编辑器                       | partially verified | 管理员渲染和打开/关闭通过，截图已检查；写入真实后端与图片详情操作未覆盖                                                |
| REPORTER 只读界面、加载与失败                    | verified           | fixture 检查无编辑/分类操作；失败态不冒充空态；延迟请求显示 loading                                                    |

最终后台 smoke 日志为 `/tmp/markfix-audit-dashboard-verified.log`，截图目录为 `/var/folders/3k/yw7plc2n1ps4_33bct9qx0hc0000gn/T/markfix-dashboard-components-5FvrH8`；已检查在线体验区以及修复后仅显示错误提示的失败态。修复前观察目录为 `/var/folders/3k/yw7plc2n1ps4_33bct9qx0hc0000gn/T/markfix-dashboard-components-F6032E`。临时证据可能被系统清理，应在发布验收前归档或按脚本重跑。

## 独立审查与恢复门禁

经用户授权的 GPT-5.6-sol 独立审查者读取原始代码与证据，有权否决。第一轮明确提出 orphan 恢复缺失、旧迁移并发、窗口销毁错误；修复后重新检查实现、单元测试、数据库日志与重建后的 Electron 日志，三项最终均 **Accept，无剩余必改**。独立执行相关测试 16/16、API typecheck、涉及文件格式检查和 diff 检查通过。

拆分与契约搬迁不改变持久化格式；需要撤回时只撤回本轮对应文件/hunk，保留已有用户改动。不要整仓 reset。数据清理采用前向恢复，维护脚本需要独立的目标环境删除授权；本轮只在隔离测试目录执行。旧迁移在事务失败时保留原始旧行，成功后以 Report 为权威来源，不建立第二套状态真相。

## 完整验收限制

未验证的诊断/权限界面、真实邮件/账户/部署与长页完整交互使全项目不能给出无条件 **Accept**。测试和类型检查不是所有文件语义正确的证明。下一次完整发布验收应补齐上述缺口并保存目标环境证据；本记录不宣称生产迁移、签名、公证、邮件或托管存储已完成。

## 最终仓库门禁

`/tmp/markfix-audit-final-gates.log` 记录 Node 24 下依次完成的 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`，全部通过，进程退出码 0。单元测试共 248 项（contracts 14、anchor 3、annotation-model 1、api-client 6、API 74、dashboard 15、desktop 135）。另有隔离 PostgreSQL 场景检查、Electron 行为/视觉 smoke 和部署脚本 7 项本地测试通过。

最终 diff 检查通过。这里只确认本地仓库和所列 fixture 的验证结果；上述未验证矩阵保持原状态，不因全量测试通过而升级。
