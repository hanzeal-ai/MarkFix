# 2026-09-25 Vibe Coding 审查与清理

## 结论与范围

代码清理通过独立复核；全产品结论为**有条件接受**，不能当作 Windows 发布验收。

审查基线为本地 `3fdddba` 加任务开始时已有工作区变更（包括 Windows 自动更新与保存诊断）。使用任务开始文件哈希 `/tmp/markfix-vibe-start-hashes.json` 和补丁 `/tmp/markfix-vibe-start.patch` 区分既有改动；没有提交、推送、部署、迁移数据或新增依赖。

依据 `AGENTS.md`、Vibe Coding 2.2 和 `docs/vibe-review-checklist.md`，检查当前调用者、运行时入口、共享契约、兼容分支与文件职责。风险为 R2：涉及共享报告接口输入和主进程 IPC。独立审查者直接读取源码、依赖实现及测试，提出过必须修复的 NodeNext 导入扩展名问题，修复后复核通过。静态扫描不构成“整个仓库绝无死代码”的证明。

## 已规范化

1. 删除无调用者的 `CapturePanel.tsx`、其独有 CSS 和 `useCaptureEditor.updateCaptureText`。当前截图输入由网页内编辑器承担，统一预览仍使用 `AnnotationPreview`；共享 `capture-panel.css` 继续保留。
2. 删除无消费者的 `apiErrorSchema`、`AnnotationRecordStatus`、`CaptureBundle`、`ReproductionStep` 类型导出。相关有消费者的运行时 Schema 保留；contracts 包为工作区私有包。
3. 报告状态变更使用现有 `transitionSchema` 做运行时校验，拒绝空输入、未知动作、不合法版本和说明内容。`ReportTransition` 统一服务端动作类型与 API Client 参数，移除独立手写输入类型。项目成员权限、合法状态转换及数据库版本条件保持原有权威边界。
4. 从截图 IPC 中提取完整的批注编辑 IPC 组到 `main/ipc/register-annotation-editor-ipc.ts`：保存反馈、元素重选、inline note 同步与提交。截图模块仅负责截图。保留 sender、主 frame、页面 URL 校验与弹窗去重生命周期。
5. 删除 Windows 更新清单顶层 `path`、`sha512` 旧兼容字段。当前唯一客户端 `electron-updater@6.8.9` 的 `Provider.getFileList` 优先读取 `files`，仅在缺失时读取 deprecated 顶层字段；旧版 MarkFix 不具备这条自动更新路径，没有需要兼容的消费者。
6. 后台烟测按实际入口进入项目设置，再检查仓库绑定；编辑菜单按 PointerEvent 打开，失败状态定位到当前项目详情页。增加仅复查应用页面的模式，避免重复采集公开页。审查清单补充 Agent 授权、交互演示及项目设置。

保留：Windows/macOS 更新适配、macOS 试用包手动更新、更新准备期间的主进程锁及 UI 投影、有消费者的共享样式、历史数据库迁移。它们均不是应当直接删除的遗留兼容层。主进程和工作区协调文件仍较大，本次没有按行数机械拆分。

## 验证

环境：macOS arm64，Node 24，pnpm 11.25.0，Electron 44.1.1；所有 GUI 使用本地构建和隔离测试资料。

- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 通过。共 389 个测试：contracts 41、anchor 3、annotation-model 2、api-client 7、API 114、dashboard 19、desktop 195、CLI 8。
- 新增报告接口边界测试覆盖 8 种非法输入、权限/版本冲突和合法原子版本写入。批注 IPC 测试覆盖不可信 sender、子 frame、旧页面、非法输入及反馈。
- 三个应用额外执行 `noUnusedLocals`/`noUnusedParameters` 检查通过；全仓搜索核实删除对象无现行消费者。
- `python3 -m unittest discover -s infra/aliyun -p 'test_*.py'`：30 个通过。没有执行真实发布。
- 后台应用烟测、Agent 授权烟测、桌面菜单/设置烟测通过。页面截图已实际查看，下面区分行为证据与视觉证据。
- `git diff --check` 通过。全项目类型检查首次因新增测试缺少 `.js` 扩展名失败，修复后复跑通过。

命令日志：`/tmp/markfix-vibe-{format,lint,typecheck,test,build,infra,dashboard,dashboard-app,agent,account,menu,inline}.log`。临时证据可能被系统清理，复现应重新运行对应脚本。

## 页面与场景覆盖

发现源：desktop renderer `main.tsx`、`child-window-manager.ts`，dashboard `main.tsx`、`routes.ts`、`WebRoot.tsx` 及实际渲染入口。

证据目录均在 `/var/folders/3k/yw7plc2n1ps4_33bct9qx0hc0000gn/T/`：

- W：`markfix-dashboard-components-MWJMHg`，1280×900 CSS px，公开页/测试账户。
- A：`markfix-dashboard-components-cpysev`，1280×900 CSS px，ADMIN 与 REPORTER fixture。
- G：`markfix-agent-access-taXqIP`，1100×850、390×850 CSS px，测试授权申请。
- D：`markfix-native-ImLANX/screenshots`，主窗口 1440×900、设置窗口 760×488 CSS px，测试账户。
- F：`markfix-native-pfkQ4s/screenshots`、`markfix-inline-fItTG6/evidence`，本地项目失败证据。

| 界面或流程                                             | 状态               | 已观察与限制                                                                                           |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------ |
| 官网首页、文档、定价、下载、隐私、条款                 | verified           | W 对应页面首屏逐张查看；不代表法律审查或真实下载服务验证                                               |
| Web 登录、注册、找回密码                               | partially verified | W 表单视觉正常；真实邮件与生产身份流程未执行                                                           |
| Web 验证邮箱、重置密码、接受邀请                       | partially verified | W 缺 token/默认状态已查看；真实 token 成功流程未执行                                                   |
| Web 账户设置                                           | partially verified | W 账户主体已查看；fixture 未提供 grants，出现 JSON 解析错误，不能称为成功态验收                        |
| 官网交互演示                                           | partially verified | W 仅查看折叠入口；展开后的元素与截图操作未重新验收                                                     |
| 后台概览、项目、用户、项目设置、项目详情               | verified           | A 与前置项目设置截图；进度、表格、绑定保存断言通过，截图已查看                                         |
| 后台标注详情、编辑器                                   | verified           | A 两个弹窗截图已查看，菜单入口行为通过                                                                 |
| 后台加载、空、失败、只读和管理员状态                   | verified           | A 对应截图与只读无操作按钮断言通过；真实 API 权限由单元测试补充，不替代生产联调                        |
| Agent 设备授权页与移动布局                             | verified           | G 授权、拒绝、过期错误、空项目和自动关闭行为通过，3 张截图已查看                                       |
| Desktop 登录/注册、恢复登录状态                        | partially verified | D 注册及恢复中画面已查看；登录截图采集于恢复阶段，不能代表稳定登录表单视觉                             |
| Desktop 设置：通用、账户                               | verified           | D 窗口重新打开，通用设置及修改密码画面、键盘交互通过                                                   |
| Desktop 设置：订阅                                     | partially verified | 菜单脚本经过该页，但 fixture 订阅请求 404，无成功态视觉证据                                            |
| Desktop 主窗口：浏览、侧栏、错误提示                   | partially verified | 本地创建、加载就绪、帮助和菜单通过；默认 smoke 在侧栏视口断言出现 1440/1240 不一致，未排除布局时序问题 |
| Desktop 更新准备弹窗                                   | partially verified | inline smoke 检查了网页隐藏与恢复；本轮后续截图流程失败，不能替代升级验收                              |
| Desktop 元素批注、截图冻结、滚动、路由、回放和页面隔离 | blocked            | 本轮原生截图出现 `UnknownVizError`，随后选区超时/冻结图断言失败；两次同路径失败后停止，未降低断言      |
| Desktop 标注提交审阅、截图预览、全局历史、项目历史     | unverified         | 默认 smoke 在前置侧栏检查退出，inline 在截图前置失败，本轮未取得这些子窗口的有效新证据                 |
| Desktop 诊断、工作区空态、权限失败态                   | unverified         | 本轮未执行独立界面场景；相关权限/数据路由单元测试不算视觉证据                                          |
| Windows 安装包内升级、安装重启、数据保留               | unverified         | 当前没有 Windows 目标环境，macOS 测试无法替代                                                          |

## 影响、恢复和关闭条件

本报告所述代码清理没有引入数据库结构或数据迁移，不涵盖随后合入的读取授权功能。最终合并版本新增 `AnnotationReadGrant` 表及 `20260925000000_annotation_read_grants` 迁移，发布与恢复必须同时依据 `annotation-read-authorization.md` 和 `reviews/2026-09-25-worktree-integration.md`。API 输入收紧到既有契约，旧客户端合法请求仍按原路径处理；无消费者导出删除只影响仓库内构建，已全量检查。IPC 移动保持 channel 和调用签名。

恢复时仅反向应用本次清理文件的差异，依据任务开始哈希/补丁确认原内容，不能对整个工作区执行 reset。发布恢复另按既有 Windows 发布器的策略回滚机制处理；本次未发布。

代码整理目标已完成，独立复核没有剩余代码阻断项。整体验收仍需任务负责人在可正常截图的桌面环境关闭上述 Electron 失败与未验证界面，并在 Windows 上完成两版本安装升级、自动重启和数据保留测试。未完成前不得将本报告解释为全产品 Accept 或生产发布批准；没有为缺口授予永久例外。
