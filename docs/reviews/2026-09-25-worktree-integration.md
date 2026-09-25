# 2026-09-25 未提交工作区集成

## 范围与授权

用户要求提交全部已盘点工作区并合入 main，已有 main 推送与自动部署授权。源提交 ea2da47、4a74ee4；远端基线 70ae6da。保留紫色、先前 UI/UX 以及较新 IPC 拆分。Windows 旧工作区与 main 重复内容已合并；不恢复后续审查明确删除、无现行消费者的 manifest 顶层 path/sha512。官网文件是其他任务已有内容，本轮原样集成，不重新设计。

风险 R2：新增批注读取授权、共享复验状态、邮件投递和部署资源配置。独立审查基于原始差异、权限实现和测试给出有条件接受，未发现阻断本次 main/网站 API 部署的新增缺陷。已修正旧审查报告迁移范围描述。Windows 目标平台完整安装升级属于继承的未验证风险，本报告不声明完成 Windows 发布验收。

## 验证

Node 24、pnpm 11.25.0；Prisma generate、format:check、lint、typecheck、test、build 通过。工作区测试 contracts 41、anchor 3、annotation-model 2、api-client 7、API 129、dashboard 19、desktop 195，CLI 8 项，总计 404 项。基础设施 receiver/deploy/publish-desktop/publish-images 共 30 项通过。

真实 Electron `smoke-local-agent.mjs` 通过，包括导航隔离、本地提交、失败重试、修复完成进入 READY_FOR_VERIFY、人工点击验证通过到 RESOLVED。后台 `smoke-dashboard-components.mjs` 通过，并新增生成、轮换、撤销读取授权的真实渲染交互断言；截图人工查看，紫色保留。接口权限、过期、撤销及成员隔离由 API 负向测试覆盖，UI fixture 不替代生产权限验证。

`smoke-inline-notes.mjs` 修正旧的三模式断言为当前四模式后，继续在截图模式遇到既有 `UnknownVizError` / 选区等待超时。因此原生截图、滚动/回放全链路仍是部分验证，不把失败脚本算作通过；不降低断言或继续无证据重试。Windows 两版本安装升级、签名、真实邮件到达、真实生产登录未在本轮验证。

## 数据与恢复

真实隔离 PostgreSQL 17：先应用远端四个迁移，写入测试用户和项目，再运行 `prisma migrate deploy` 应用第五个 `20260925000000_annotation_read_grants`。与最终 Prisma schema 比较无漂移；原用户/项目保持不变，新增授权唯一约束、撤销、项目删除级联和事务回滚通过。pg_dump 恢复到独立 recovery 数据库后，用户、项目、已撤销授权数量均为 1。未在本地验证中访问生产数据库。

生产仍由既定部署流程先备份并停写后迁移、健康检查后切换。新增迁移仅建表，不重写既有业务数据。回退时先撤销授权，使用上个版本 70ae6da 的应用并保留新增表及既有数据；重新上线前检查原授权是否应继续有效。禁止为回滚删除批注。失败部署按既有 forward-repair 流程诊断，不自行回滚历史破坏性迁移。

日志在本机 `/tmp/worktree-integration-20260925/`；临时证据可被清理，以上命令和场景用于复现。
