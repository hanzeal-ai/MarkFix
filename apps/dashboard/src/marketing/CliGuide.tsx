import type { ReactNode } from 'react';
import './cli-guide.css';

function Command({ children }: { children: string }) {
  return (
    <pre>
      <code>{children}</code>
    </pre>
  );
}

export function CliGuide({
  setupCommand = 'markfix setup --server https://markfix.example.com',
  children,
}: {
  setupCommand?: string;
  children?: ReactNode;
}) {
  return (
    <article id="agent" className="cli-guide">
      <span>MARKFIX CLI · CODEX</span>
      <h2>接入 Codex</h2>
      <p>
        通过 MarkFix CLI，将云端标注交给当前代码仓库中的 Codex 会话处理。完成接入后，Codex
        可以读取问题上下文、领取任务，并将验证结果回写到 MarkFix。
      </p>
      <nav className="cli-guide-toc" aria-label="CLI 接入目录">
        <a href="#cli-install">安装</a>
        <a href="#cli-authorize">授权</a>
        <a href="#cli-bind">绑定项目</a>
        <a href="#cli-verify">验证接入</a>
        <a href="#cli-repair">开始修复</a>
        <a href="#cli-troubleshooting">常见问题</a>
      </nav>
      <section>
        <h3>开始之前</h3>
        <ul>
          <li>本机已安装 Node.js 24 或更高版本、npm、Git 和 Codex。</li>
          <li>
            已有 MarkFix 账号，并且是目标云端标注项目的成员。绑定操作需要项目所有者或管理员权限。
          </li>
          <li>
            已取得 MarkFix CLI 安装包和服务的 HTTPS API 地址。API
            地址可能与官网地址不同，请以服务管理员提供的信息为准。
          </li>
        </ul>
        <p>
          本文中的代码项目指本地 Git 仓库；标注项目指 MarkFix
          中收集问题的云端项目。绑定用于建立两者的对应关系。
        </p>
      </section>
      <section id="cli-install">
        <h3>1. 安装 CLI</h3>
        <p>
          当前通过安装包分发。向 MarkFix 服务管理员获取 <code>markfix-cli-0.1.0.tgz</code>
          ，在安装包所在目录执行：
        </p>
        <Command>
          {'node --version\nnpm install -g ./markfix-cli-0.1.0.tgz\nmarkfix --version'}
        </Command>
        <p className="cli-guide-result">
          预期结果：Node.js 主版本不低于 24，MarkFix CLI 输出 0.1.0。若找不到 markfix 命令，请检查
          npm 全局可执行目录是否已加入 PATH。
        </p>
      </section>
      <section id="cli-authorize">
        <h3>2. 授权访问 MarkFix</h3>
        <p>
          进入准备修复的 Git 仓库，执行授权命令。下方服务地址应与标注所在的 MarkFix
          实例一致；示例域名需替换为实际 API 地址。
        </p>
        <Command>{`cd /path/to/your-repository\n${setupCommand}`}</Command>
        {children}
        <ol>
          <li>在 CLI 打开的浏览器页面登录 MarkFix。</li>
          <li>核对终端与网页显示的授权码，选择允许访问的标注项目。</li>
          <li>点击“授权此设备”，返回终端等待命令完成。</li>
        </ol>
        <p className="cli-guide-result">
          预期结果：返回 JSON 中 authorized 为 true，repository 包含当前仓库，skillPath 指向已安装的
          MarkFix Skill。repository 为 null 表示授权已保存，但仓库尚未上报，需执行 repo register。
        </p>
        <p>
          macOS 默认使用系统钥匙串。Linux 或 Windows 请在 setup 命令后加{' '}
          <code>--credential-store file</code>；无法自动打开浏览器时加 <code>--no-browser</code>
          ，手动打开终端中的授权链接。
        </p>
      </section>
      <section id="cli-bind">
        <h3>3. 绑定标注项目</h3>
        <ol>
          <li>打开 MarkFix 桌面端，将鼠标移到目标云端项目行，点击名称右侧的三点菜单。</li>
          <li>选择“绑定项目”，保持默认的“从已有选择”。</li>
          <li>从下拉列表中选择 CLI 上报的代码项目，核对名称与设备，点击“保存”。</li>
        </ol>
        <p>
          “自定义”仅保存仓库名称。需要自动匹配时，请在仓库上报后通过“从已有选择”确认绑定。仅存在同名记录不会自动建立关联。
        </p>
        <p>
          也可以不设置永久绑定：当没有唯一匹配项目时，由 Codex
          在本次会话中询问你要处理哪个标注项目。
        </p>
      </section>
      <section id="cli-verify">
        <h3>4. 验证接入</h3>
        <Command>{'markfix auth status\nmarkfix projects resolve'}</Command>
        <p>
          授权有效时，auth status 返回 authorized: true；绑定唯一匹配时，projects resolve 返回
          selectionRequired: false，projects 中包含目标标注项目。
        </p>
        <p>复制该项目的 id，替换下方 PROJECT_ID，确认可以读取待处理标注：</p>
        <Command>{'markfix issues list --project PROJECT_ID'}</Command>
        <p className="cli-guide-result">
          返回 items 列表表示读取成功。空列表表示该项目当前没有 OPEN
          状态的已提交标注，不代表授权失败。
        </p>
      </section>
      <section id="cli-repair">
        <h3>5. 在 Codex 中开始修复</h3>
        <p>在同一代码仓库中新建 Codex 会话，确认 MarkFix Skill 已加载，然后发送：</p>
        <blockquote>
          使用 MarkFix
          Skill，读取当前项目的待处理标注。逐条修复并运行必要验证，将每条问题的修复结果回写到
          MarkFix。
        </blockquote>
        <p>
          Codex
          会根据项目绑定选择标注，读取截图与上下文，领取问题后修改代码并执行验证。未绑定或匹配多个项目时，请根据会话提示选择。
        </p>
        <div className="cli-guide-table">
          <table>
            <thead>
              <tr>
                <th>结果</th>
                <th>如何确认</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>修复完成</td>
                <td>服务端确认后，管理后台显示“已完成”。</td>
              </tr>
              <tr>
                <td>修复失败</td>
                <td>后台显示失败原因与阶段。修正阻塞条件后，可要求 Codex 重试。</td>
              </tr>
              <tr>
                <td>等待同步</td>
                <td>结果已暂存本机；恢复网络后执行 markfix sync，收到服务端确认后再视为完成。</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          修复完成表示本地修改通过所报告的检查，不等同于代码已提交、部署或发布。CLI
          授权不会额外授予这些操作权限。
        </p>
      </section>
      <section id="cli-commands">
        <h3>常用命令</h3>
        <div className="cli-guide-table">
          <table>
            <thead>
              <tr>
                <th>命令</th>
                <th>用途</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>markfix repo register</code>
                </td>
                <td>在当前 Git 仓库中上报项目；切换仓库后可再次执行。</td>
              </tr>
              <tr>
                <td>
                  <code>markfix projects list</code>
                </td>
                <td>查看当前授权允许访问的标注项目。</td>
              </tr>
              <tr>
                <td>
                  <code>markfix issues list --project PROJECT_ID --status FIX_FAILED</code>
                </td>
                <td>查看该项目修复失败的标注。</td>
              </tr>
              <tr>
                <td>
                  <code>markfix sync</code>
                </td>
                <td>补传暂存的修复结果。</td>
              </tr>
              <tr>
                <td>
                  <code>markfix logout</code>
                </td>
                <td>撤销当前 CLI 授权并删除本机凭据。</td>
              </tr>
              <tr>
                <td>
                  <code>markfix --help</code>
                </td>
                <td>查看完整命令与参数。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section id="cli-troubleshooting">
        <h3>常见问题</h3>
        <details>
          <summary>下拉列表中没有我的代码项目</summary>
          <p>
            先在对应 Git 仓库执行 markfix repo register，再关闭并重新打开绑定弹窗。确认 CLI
            与桌面端连接同一服务，并使用具有该标注项目权限的账号。本地标注项目仅支持自定义名称，不能用于云端自动绑定。
          </p>
        </details>
        <details>
          <summary>授权成功后仍找不到标注项目</summary>
          <p>
            执行 markfix projects
            list。列表同时受授权时选择的项目和当前成员权限限制。新增授权范围前，先同步未上传结果，再
            logout 并重新 setup，选择所需项目。
          </p>
        </details>
        <details>
          <summary>Codex 没有识别 MarkFix Skill</summary>
          <p>
            检查 setup 返回的 skillPath 文件是否存在，然后新建会话。默认路径为
            ~/.codex/skills/markfix/SKILL.md；设置 CODEX_HOME 时位于该目录下的 skills/markfix。setup
            不覆盖已存在的同名 Skill，出现保留提示时请核对文件内容。
          </p>
        </details>
        <details>
          <summary>任务被占用，或提示标注已变化</summary>
          <p>
            重新读取标注，不要强制覆盖。领取任务的租约为 15 分钟，可由 Agent
            续期；标注修改后，旧任务的结果会被拒绝。失败或中断任务需明确要求重试。
          </p>
        </details>
        <details>
          <summary>上传结果时断网</summary>
          <p>
            执行 markfix sync
            重试。等待服务端确认前不要将任务视为完成，也不要重新修复同一问题。未同步结果关联原授权，处理完毕前不要
            logout 或切换服务。
          </p>
        </details>
      </section>
      <section>
        <h3>授权与数据范围</h3>
        <p>
          仓库登记上传名称、随机标识和设备信息，不上传源码、本地绝对路径或会话记录。CLI
          只能访问已授权且你仍有成员权限的项目。修复结果中会上传你或 Agent
          提供的摘要、原因和检查记录，请勿在这些内容中包含凭据。
        </p>
        <p>
          <a href="/agent">管理已授权设备 →</a>
        </p>
      </section>
    </article>
  );
}
