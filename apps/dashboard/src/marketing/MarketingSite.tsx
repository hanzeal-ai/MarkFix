import { ArrowRight, Code2, Crosshair, Download, FolderKanban, Plus } from '@markfix/ui/icons';
import { Button } from '@markfix/ui';
import { InteractiveDemo } from './InteractiveDemo';
import { SiteFooter, SiteHeader } from './SiteChrome';
import './premium-marketing.css';
import './product-home.css';

export function MarketingSite() {
  return (
    <div className="premium-site product-home">
      <SiteHeader />
      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <h1 id="home-title">
              Mark It! <span>Fix It!</span>
            </h1>
            <p>
              像在 Word 里写批注一样，在网页上选中问题、标记截图，
              <br className="home-desktop-break" />
              把上下文交给研发。
            </p>
            <div className="home-actions">
              <Button asChild>
                <a href="#experience">
                  在线体验 <ArrowRight size={16} />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="/download">
                  <Download size={16} /> 下载 macOS 桌面端
                </a>
              </Button>
            </div>
            <a className="home-agent-link" href="/docs#agent">
              支持 Codex 接入 <ArrowRight size={13} />
            </a>
          </div>
          <nav className="home-product-links" aria-label="产品能力">
            <a href="#product">
              <Crosshair /> 网页标注 <ArrowRight />
            </a>
            <a href="#collaboration">
              <FolderKanban /> 项目协作 <ArrowRight />
            </a>
            <a href="#agent">
              <Code2 /> Codex 接入 <ArrowRight />
            </a>
          </nav>
        </section>

        <section className="home-product" id="product" aria-labelledby="annotation-title">
          <h2 id="annotation-title">
            从页面标注，
            <br />
            到完整交接。
          </h2>
          <div className="home-product-layout">
            <figure className="home-annotation-image">
              <img
                src="/marketing/screenshot-editor.png"
                alt="MarkFix 截图标注工具与页面标记区域"
                width="1440"
                height="900"
              />
              <figcaption>MarkFix 桌面端 / 截图标记</figcaption>
            </figure>
            <div className="home-product-copy">
              <p>
                <strong>批注与截图，放在一起说明。</strong>
                <br />
                点选元素写建议，或在截图上标出细节。提交前统一检查，保留问题的页面与上下文。
              </p>
              <dl>
                <dt>标注工具</dt>
                <dd>元素批注</dd>
                <dd>区域截图</dd>
                <dd>箭头、画笔与文字标记</dd>
                <dd>标注回放</dd>
              </dl>
              <a href="/docs#capture">
                查看使用文档 <ArrowRight size={15} />
              </a>
            </div>
          </div>
        </section>

        <section className="home-detail-grid" id="collaboration">
          <article>
            <div className="home-detail-label">
              <FolderKanban size={16} /> 项目协作
            </div>
            <h2>
              按项目整理反馈，
              <br />
              查看处理进度。
            </h2>
            <p>本地项目保存在本机。云端项目按成员与角色协作，统一查看标注和修复结果。</p>
            <div className="home-review-image">
              <img
                src="/marketing/annotation-review.png"
                alt="MarkFix 提交预览，勾选需要提交的元素批注与截图"
                width="1040"
                height="748"
                loading="lazy"
              />
            </div>
            <a href="/docs#projects">
              了解项目管理 <ArrowRight size={15} />
            </a>
          </article>
          <article id="agent">
            <div className="home-detail-label">
              <Code2 size={16} /> Codex 接入
            </div>
            <h2>
              在代码仓库中，
              <br />
              处理对应的标注。
            </h2>
            <p>
              本机项目无需云端账号，云端项目按授权范围访问。绑定代码仓库后，Codex
              可读取已提交标注、执行修复与验证，并回传结果。
            </p>
            <div className="home-cli">
              <div>
                <span>Terminal</span>
                <span>读取项目标注</span>
              </div>
              <pre>
                <code>
                  <span className="home-code-comment"># 本机项目：保持桌面端运行</span>
                  {'\n'}markfix repo register --local{'\n\n'}
                  <span className="home-code-comment"># 匹配当前仓库的标注项目</span>
                  {'\n'}markfix projects resolve --local{'\n\n'}
                  <span className="home-code-comment"># 查看可用命令与参数</span>
                  {'\n'}markfix --help
                </code>
              </pre>
            </div>
            <a href="/docs#agent">
              安装 CLI 并接入 Codex <ArrowRight size={15} />
            </a>
          </article>
        </section>

        <section className="home-workflow" aria-labelledby="workflow-title">
          <h2 id="workflow-title">从发现问题，到验证修复。</h2>
          <ol>
            <li>
              <span>01</span>
              <h3>打开项目</h3>
              <p>选择仅本机或云端项目，打开要检查的网页。</p>
            </li>
            <li>
              <span>02</span>
              <h3>直接标注</h3>
              <p>点选元素或冻结截图，在页面内填写备注并保存。</p>
            </li>
            <li>
              <span>03</span>
              <h3>预览并提交</h3>
              <p>在右侧检查记录，勾选本次要交给团队处理的问题。</p>
            </li>
            <li>
              <span>04</span>
              <h3>交给 Codex</h3>
              <p>绑定代码仓库，读取上下文、修复并验证，回写处理结果。</p>
            </li>
          </ol>
          <a href="/docs#updates">
            查看近期功能与完整步骤 <ArrowRight size={15} />
          </a>
        </section>

        <section className="home-experience" id="experience">
          <div className="home-experience-heading">
            <h2>试一下网页标注。</h2>
            <p>无需安装。体验记录不会上传，刷新后清空。</p>
          </div>
          <details className="home-demo-disclosure">
            <summary>
              <span>打开交互演示</span>
              <Plus size={18} />
            </summary>
            <div className="home-demo-content">
              <InteractiveDemo />
            </div>
          </details>
        </section>

        <section className="home-get-started">
          <div>
            <h2>开始使用 MarkFix。</h2>
            <p>macOS 桌面端，支持本地标注与云端协作。</p>
          </div>
          <div className="home-actions">
            <Button asChild>
              <a href="/download">下载桌面端</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/pricing">查看定价</a>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
