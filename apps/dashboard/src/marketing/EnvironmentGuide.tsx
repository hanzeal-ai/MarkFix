export function StorageGuide() {
  return (
    <article id="storage-mode" className="cli-guide">
      <span>使用方式</span>
      <h2>本地与云端</h2>
      <div className="cli-guide-table">
        <table>
          <thead>
            <tr>
              <th>方式</th>
              <th>数据存放</th>
              <th>CLI 与协作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>仅本机</td>
              <td>桌面端本机数据库</td>
              <td>CLI 使用 --local，自动访问所有本地项目</td>
            </tr>
            <tr>
              <td>云端协作</td>
              <td>所连接服务的数据库与截图存储</td>
              <td>提交后按项目成员及授权范围访问</td>
            </tr>
            <tr>
              <td>本机自建服务</td>
              <td>自己的本地数据库与附件卷</td>
              <td>仍选择“云端协作”，CLI 连接本地 API</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        登录页选择“仅在本机使用”，无需云端账号或自建 API；使用 CLI
        时需保持桌面端运行。已有本机标注不会因切换模式或服务自动上传、迁移。
      </p>
      <p>
        本机和云端都支持批注、截图与历史回看。CLI
        只读取已提交的标注；本机修复结果在桌面查看，云端结果同步到桌面和管理后台。
      </p>
    </article>
  );
}

export function DeveloperGuide() {
  return (
    <article id="development" className="cli-guide">
      <span>开发者</span>
      <h2>开发启动与本地构建</h2>
      <p>
        以下命令在 MarkFix 源码仓库根目录执行。自建服务需要 Docker Desktop / Compose
        v2；桌面开发需要 macOS、Node.js 24、pnpm 11.25.0 和 Xcode Command Line Tools。
      </p>
      <section>
        <h3>只使用本机项目</h3>
        <p>
          无需 Docker 或云端账号。直接启动桌面，选择“仅在本机使用”，创建项目并提交选中的标注。安装
          CLI 前，先从源码启动桌面：
        </p>
        <pre>
          <code>
            {
              'pnpm install\npnpm --filter @markfix/database db:generate\npnpm --filter @markfix/desktop rebuild:native\npnpm dev:desktop'
            }
          </code>
        </pre>
        <p>按下方打包命令安装 CLI 后，在代码仓库执行：</p>
        <pre>
          <code>
            {
              'markfix projects list --local\nmarkfix repo register --local\nmarkfix projects resolve --local\nmarkfix issues list --project PROJECT_ID --local'
            }
          </code>
        </pre>
        <p>
          本机 CLI 无需配置或手动授权，对所有本地项目拥有完整访问权限。每条命令都需带
          --local，包括修复回写和
          sync。保持桌面运行，结果只写回本机；在桌面批注面板查看修复状态和原因。
        </p>
      </section>
      <section>
        <h3>1. 启动本地服务与桌面端</h3>
        <pre>
          <code>
            {
              'docker compose up --build -d\ndocker compose ps\npnpm install\npnpm --filter @markfix/database db:generate\npnpm --filter @markfix/desktop rebuild:native\npnpm dev:desktop'
            }
          </code>
        </pre>
        <p>
          官网与后台：http://localhost:4311；API：http://localhost:4310/v1/health。开发账号：admin@markfix.local，密码：markfix-admin。Compose
          会同步开发数据库结构，不可用于生产迁移。
        </p>
        <p>桌面默认支持 HTTP 和 HTTPS 网页。结束时执行 docker compose down，数据卷会保留。</p>
      </section>
      <section>
        <h3>2. 使用本地服务的 CLI</h3>
        <p>
          在桌面选择“云端协作”，创建项目并提交标注。以下流程连接自己的本地
          API，不会读取桌面“仅本机”项目。
        </p>
        <pre>
          <code>
            {
              'pnpm --filter @markfix/cli build\nmkdir -p artifacts\npnpm --filter @markfix/cli pack --pack-destination "$PWD/artifacts"\nnpm install -g ./artifacts/markfix-cli-0.1.1.tgz\ncd /path/to/your-repository\nmarkfix projects list --server http://localhost:4310 --allow-local-http'
            }
          </code>
        </pre>
        <p>
          首次命令自动打开浏览器。登录开发账号、核对授权码、选择项目并批准后，命令继续返回项目列表。Linux
          / Windows 需另加 --credential-store file。远程服务必须使用 HTTPS。
        </p>
        <p>
          绑定仓库后按上方“Codex 接入”流程领取和回写。需要同时连接其他服务时，使用不同的
          MARKFIX_CLI_HOME，并在每次命令中保持对应目录。
        </p>
      </section>
      <section>
        <h3>3. 构建 macOS 应用</h3>
        <pre>
          <code>
            {
              'pnpm --filter @markfix/desktop build\nCSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @markfix/desktop package:mac'
            }
          </code>
        </pre>
        <p>
          build 输出 apps/desktop/out；package:mac 输出 apps/desktop/dist 中的 DMG /
          ZIP。上述未签名包供本机验证，不代表已签名、公证或发布。
        </p>
        <p>
          打包默认使用生产服务配置。连接自己的服务时，在构建命令前设置
          MARKFIX_SERVICE_ORIGIN=https://你的服务域名，该入口需同时承载官网和 /v1 API。开发的 Vite
          4311 端口不提供这个统一代理，不能直接作为生产入口。服务地址在构建时写入应用。
        </p>
      </section>
    </article>
  );
}
