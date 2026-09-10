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
            <h1 id="home-title">Mark It! Fix It!</h1>
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
          <figure className="home-hero-image">
            <img
              src="/marketing/project-management.png"
              alt="MarkFix 桌面端：从页面标注，在右侧填写批注"
              width="1440"
              height="900"
            />
          </figure>
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
                width="1100"
                height="768"
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
              通过 MarkFix 授权后，CLI 按项目权限读取问题。绑定仓库后，Codex
              可匹配当前项目并回传修复结果。
            </p>
            <div className="home-cli">
              <div>
                <span>Terminal</span>
                <span>读取项目标注</span>
              </div>
              <pre>
                <code>
                  <span className="home-code-comment"># 检查授权状态</span>
                  {'\n'}markfix auth status{'\n\n'}
                  <span className="home-code-comment"># 匹配当前仓库的标注项目</span>
                  {'\n'}markfix projects resolve{'\n\n'}
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
