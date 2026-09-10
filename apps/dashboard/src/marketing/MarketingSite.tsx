import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Crosshair,
  Layers3,
  ShieldCheck,
} from '@markfix/ui/icons';
import { Button } from '@markfix/ui';
import { InteractiveDemo } from './InteractiveDemo';
import { SiteFooter, SiteHeader } from './SiteChrome';
import { WorkflowPreview } from './WorkflowPreview';
import './premium-marketing.css';
import './product-home.css';

export function MarketingSite() {
  return (
    <div className="premium-site product-home">
      <SiteHeader />
      <main>
        <section className="home-intro">
          <div className="home-intro-copy">
            <a className="home-announcement" href="/docs#agent">
              <span /> 现已支持 Codex 接入 <ArrowUpRight size={14} />
            </a>
            <h1>
              网页上的问题，
              <br />
              在这里走向解决。
            </h1>
            <div className="home-intro-bottom">
              <p>
                直接在网页上批注、标记截图。
                <br />
                把准确的上下文交给研发或 Codex，让反馈有始有终。
              </p>
              <div className="home-actions">
                <Button asChild>
                  <a href="/download">
                    下载桌面端 <ArrowRight />
                  </a>
                </Button>
                <a href="#experience">
                  在线体验 <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
          </div>
          <WorkflowPreview />
          <div className="home-audience">
            <span>为产品、设计与研发之间的协作而造</span>
            <span>
              网页批注 <i /> 截图标记 <i /> Agent 接入
            </span>
          </div>
        </section>

        <section className="home-workflow" id="product">
          <div className="home-section-heading">
            <span className="home-eyebrow">01 / 从反馈到行动</span>
            <h2>
              少一次解释。
              <br />
              多一分确定。
            </h2>
            <p>
              反馈不该停在聊天截图里。
              <br />
              从指出具体位置，到交接问题，再到查看修复结果。
            </p>
          </div>
          <div className="home-steps">
            <article>
              <Crosshair />
              <span>标注</span>
              <h3>
                问题在哪里，
                <br />
                就在那个位置说明。
              </h3>
              <p>点选页面元素写批注，或框选截图标记细节。再次打开记录，回到对应页面位置。</p>
              <a href="#experience">
                体验网页标注 <ArrowUpRight />
              </a>
            </article>
            <article>
              <Layers3 />
              <span>交接</span>
              <h3>
                把上下文一起交付，
                <br />
                让研发接得住。
              </h3>
              <p>批注、截图与调试证据统一预览。按项目整理，检查并选择需要提交的记录。</p>
              <a href="/docs#projects">
                了解项目管理 <ArrowUpRight />
              </a>
            </article>
            <article>
              <Code2 />
              <span>修复</span>
              <h3>
                连接代码仓库，
                <br />
                让反馈进入修复流程。
              </h3>
              <p>授权 Codex 获取对应项目的标注，处理后回传结果。未能修复的问题保留失败原因。</p>
              <a href="/docs#agent">
                阅读接入指南 <ArrowUpRight />
              </a>
            </article>
          </div>
        </section>

        <section className="home-agent">
          <div className="home-agent-copy">
            <span className="home-eyebrow">02 / 与开发工具连接</span>
            <h2>
              反馈有上下文。
              <br />
              Agent 才有方向。
            </h2>
            <p>
              将标注项目绑定到代码仓库，在 Codex
              会话中获取对应问题。修复完成后，结果回到同一个项目。
            </p>
            <ul>
              <li>
                <Check /> 通过 MarkFix 授权，按项目权限访问
              </li>
              <li>
                <Check /> 按仓库匹配，也可手动选择标注项目
              </li>
              <li>
                <Check /> 修复成功或失败，均可追踪处理结果
              </li>
            </ul>
            <a href="/docs#agent">
              接入 Codex <ArrowRight />
            </a>
          </div>
          <div className="home-agent-example" aria-label="Codex 修复流程示意">
            <div className="home-terminal-top">
              <Code2 size={16} />
              <span>Codex · 当前项目</span>
              <span>流程示例</span>
            </div>
            <div className="home-prompt">
              获取当前项目的 MarkFix 标注，
              <br />
              修复问题并回传结果。
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>匹配项目</strong>
                  <p>通过已绑定的仓库找到标注项目</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>读取问题与上下文</strong>
                  <p>查看批注、截图和修改建议</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>修复并验证</strong>
                  <p>在代码仓库中处理对应问题</p>
                </div>
              </li>
              <li>
                <Check size={16} />
                <div>
                  <strong>回传处理结果</strong>
                  <p>成功标记完成，失败说明原因</p>
                </div>
              </li>
            </ol>
            <a href="/docs#cli-install">
              查看安装与授权步骤 <ArrowUpRight size={15} />
            </a>
          </div>
        </section>

        <section className="home-demo" id="experience">
          <div className="home-section-heading">
            <span className="home-eyebrow">03 / 亲手试一次</span>
            <h2>指向问题。留下建议。</h2>
            <p>
              在下方页面点选元素，或切换到截图模式拖拽标记。
              <br />
              这是本地交互演示，记录不会上传，刷新后清空。
            </p>
          </div>
          <InteractiveDemo />
        </section>

        <section className="home-boundaries">
          <div>
            <ShieldCheck />
            <h2>
              按项目协作。
              <br />
              由你决定如何保存。
            </h2>
          </div>
          <article>
            <h3>本地项目</h3>
            <p>标注独立保存在本机，适合个人走查与整理。</p>
          </article>
          <article>
            <h3>云端项目</h3>
            <p>按项目成员与角色协作，集中查看问题和处理进度。</p>
          </article>
          <a href="/pricing">
            查看版本与额度 <ArrowUpRight size={16} />
          </a>
        </section>
        <section className="home-start">
          <span className="home-eyebrow">MARK IT. FIX IT.</span>
          <h2>
            下一条反馈，
            <br />
            从指出问题开始。
          </h2>
          <div className="home-actions">
            <Button asChild>
              <a href="/download">
                下载 MarkFix <ArrowRight />
              </a>
            </Button>
            <a href="/docs">
              阅读使用文档 <ArrowUpRight size={16} />
            </a>
          </div>
          <p>macOS 桌面端 · 支持本地与云端项目</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
