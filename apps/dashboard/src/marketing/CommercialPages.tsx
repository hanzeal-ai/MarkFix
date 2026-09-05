import {
  ArrowRight,
  Camera,
  Check,
  Download,
  FolderKanban,
  MessageSquareText,
  MousePointer2,
  ShieldCheck,
} from '@markfix/ui/icons';
import { Badge, Button, Card } from '@markfix/ui';
import { SiteFooter, SiteHeader } from './SiteChrome';
import './premium-marketing.css';

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="premium-site commercial-page">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function DocsPage() {
  return (
    <PageShell>
      <section className="commercial-page-hero">
        <span>Documentation</span>
        <h1>从第一次标注开始。</h1>
        <p>了解如何创建项目、标记网页问题、编辑截图并提交给团队处理。</p>
      </section>
      <section className="docs-layout">
        <aside>
          <strong>开始使用</strong>
          <a href="#quick-start">快速开始</a>
          <a href="#elements">元素批注</a>
          <a href="#capture">截图标注</a>
          <a href="#projects">项目管理</a>
        </aside>
        <div className="docs-content">
          <article id="quick-start">
            <span>01</span>
            <h2>快速开始</h2>
            <p>
              打开桌面端，输入需要检查的网址并创建标注项目。页面加载完成后即可切换批注或截图模式。
            </p>
            <ol>
              <li>创建或选择一个项目</li>
              <li>输入网址并打开页面</li>
              <li>选择批注方式</li>
              <li>完成后统一提交</li>
            </ol>
          </article>
          <article id="elements">
            <span>02</span>
            <h2>元素批注</h2>
            <p>
              切换到批注模式后，将鼠标移到页面元素上。MarkFix
              会显示当前可选择范围，点击后填写修改建议。
            </p>
            <div className="docs-callout">
              <MousePointer2 />
              <span>
                <strong>保留开发上下文</strong>
                <small>批注会关联页面地址、元素选择器和视觉位置。</small>
              </span>
            </div>
          </article>
          <article id="capture">
            <span>03</span>
            <h2>截图标注</h2>
            <p>
              在截图模式中拖拽建立选区，再使用移动、矩形、椭圆、箭头、画笔、文字、马赛克和序号工具完成说明。
            </p>
            <div className="docs-tool-list">
              {['移动选区', '矩形', '椭圆', '箭头', '画笔', '文字', '马赛克', '序号'].map(
                (tool) => (
                  <span key={tool}>{tool}</span>
                ),
              )}
            </div>
          </article>
          <article id="projects">
            <span>04</span>
            <h2>项目管理</h2>
            <p>
              保存后的元素批注、截图和处理记录会统一归入所属项目。在管理后台中可以继续编辑、删除、处理或驳回。
            </p>
            <Button variant="outline" onClick={() => window.location.assign('/app')}>
              进入管理后台 <ArrowRight />
            </Button>
          </article>
        </div>
      </section>
    </PageShell>
  );
}

const comparison = [
  ['标注项目', '3 个', '不限'],
  ['元素与截图标注', '支持', '支持'],
  ['项目和用户统计', '—', '支持'],
  ['成员与权限', '—', '支持'],
  ['标注处理与驳回', '基础', '完整'],
];

export function PricingPage() {
  return (
    <PageShell>
      <section className="commercial-page-hero is-centered">
        <span>Pricing</span>
        <h1>简单、明确的版本规划。</h1>
        <p>当前优先交付本地可用体验，团队商业版本将在协作能力稳定后开放。</p>
      </section>
      <section className="commercial-pricing-grid">
        <Card className="commercial-price-card">
          <div>
            <span>个人版</span>
            <Badge variant="secondary">当前可用</Badge>
          </div>
          <strong>免费</strong>
          <p>个人开发者、独立设计师和小型项目。</p>
          <ul>
            <li>
              <Check /> 3 个标注项目
            </li>
            <li>
              <Check /> 完整元素与截图标注
            </li>
            <li>
              <Check /> 本地项目记录
            </li>
          </ul>
          <Button variant="outline" onClick={() => window.location.assign('/download')}>
            <Download /> 下载桌面端
          </Button>
        </Card>
        <Card className="commercial-price-card is-featured">
          <div>
            <span>团队版</span>
            <Badge>即将开放</Badge>
          </div>
          <strong>商业订阅</strong>
          <p>产品、设计、研发和客户支持团队。</p>
          <ul>
            <li>
              <Check /> 不限项目数量
            </li>
            <li>
              <Check /> 成员与权限管理
            </li>
            <li>
              <Check /> 统计、处理和驳回闭环
            </li>
          </ul>
          <Button onClick={() => window.location.assign('/app')}>
            查看团队后台 <ArrowRight />
          </Button>
        </Card>
      </section>
      <section className="commercial-comparison">
        <div>
          <span>Capability comparison</span>
          <h2>选择适合当前阶段的版本。</h2>
        </div>
        <div className="commercial-comparison-table">
          <div className="is-heading">
            <span>功能</span>
            <strong>个人版</strong>
            <strong>团队版</strong>
          </div>
          {comparison.map(([name, personal, team]) => (
            <div key={name}>
              <span>{name}</span>
              <b>{personal}</b>
              <b>{team}</b>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

export function DownloadPage() {
  return (
    <PageShell>
      <section className="download-layout">
        <div className="download-copy">
          <span>Desktop app</span>
          <h1>让 MarkFix 运行在你的工作流里。</h1>
          <p>桌面端可以打开任意网站，完成元素批注、截图编辑、项目保存与统一提交。</p>
          <div className="download-actions">
            <Button size="lg" disabled title="正式安装包即将开放">
              <Download /> macOS 版本 · 即将开放
            </Button>
            <a href="/docs">
              查看安装与使用文档 <ArrowRight />
            </a>
          </div>
          <small>目标支持 macOS 13 及以上版本 · Apple silicon</small>
        </div>
        <div className="download-product-card">
          <div className="download-app-icon">M</div>
          <div>
            <span>MarkFix for macOS</span>
            <strong>Version 0.1.0</strong>
          </div>
          <Badge variant="secondary">Preview</Badge>
          <div className="download-capability-list">
            <p>
              <MessageSquareText /> 元素级网页批注
            </p>
            <p>
              <Camera /> 完整截图编辑工具
            </p>
            <p>
              <FolderKanban /> 本地项目与历史记录
            </p>
            <p>
              <ShieldCheck /> 明确的数据边界
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
import type { ReactNode } from 'react';
