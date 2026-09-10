import { useEffect, useState, type ReactNode } from 'react';
import { MarkFixApi } from '@markfix/api-client';
import { version as desktopVersion } from '../../../desktop/package.json';
import {
  ArrowRight,
  Camera,
  Download,
  FolderKanban,
  MessageSquareText,
  MousePointer2,
  ShieldCheck,
} from '@markfix/ui/icons';
import { Badge, Button, MarkFixMark } from '@markfix/ui';
import { MarketingPricingContent } from './MarketingContent';
import { SiteFooter, SiteHeader } from './SiteChrome';
import './premium-marketing.css';
import { CliGuide } from './CliGuide';
import { AnnotationShortcutHint, ShortcutGuide } from './ShortcutGuide';

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
          <a href="#shortcuts">快捷键</a>
          <a href="#agent">Codex 接入</a>
          <a href="#projects">项目管理</a>
        </aside>
        <div className="docs-content">
          <article id="quick-start">
            <span>01</span>
            <h2>快速开始</h2>
            <p>
              打开桌面端，选择本地或云端项目，输入 HTTPS
              网址。页面加载后，在顶部切换“批注”或“截图”；再次点击当前工具可回到浏览模式。
            </p>
            <ol>
              <li>创建或选择一个项目</li>
              <li>输入网址并打开页面</li>
              <li>选择批注方式</li>
              <li>在右侧确认标注，点击右上角提交按钮勾选记录</li>
            </ol>
          </article>
          <article id="elements">
            <span>02</span>
            <h2>元素批注</h2>
            <AnnotationShortcutHint mode="element" />
            <p>
              切换到批注模式后，将鼠标移到页面元素上。MarkFix
              会显示当前可选择范围。点击后在右侧填写备注，再点击勾号保存；点击已有记录可以重新编辑。
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
            <AnnotationShortcutHint mode="capture" />
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
          <ShortcutGuide />
          <CliGuide />
          <article id="projects">
            <span>05</span>
            <h2>项目管理</h2>
            <p>
              项目侧栏用于切换网站，历史标注用于回看记录。本地项目和标注保存在本机；云端项目按项目成员授权，可在管理后台处理与驳回。不同页面的标注独立显示。
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
  ['云端项目额度', '3 个', '不限'],
  ['元素与截图标注', '支持', '支持'],
  ['项目和用户统计', '—', '支持'],
  ['成员与权限', '—', '支持'],
  ['标注处理与驳回', '基础', '完整'],
];

export function PricingPage() {
  return (
    <PageShell>
      <MarketingPricingContent />
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
  const [download, setDownload] = useState<{
    url?: string;
    version: string;
    state: 'loading' | 'ready' | 'unpublished' | 'error';
  }>({ version: desktopVersion, state: 'loading' });
  useEffect(() => {
    let active = true;
    const api = new MarkFixApi(import.meta.env.VITE_API_URL ?? 'http://localhost:4310');
    void api
      .clientPolicy(desktopVersion, 'darwin', 'arm64')
      .then((policy) => {
        if (!active) return;
        const url = policy.downloadUrl ? new URL(policy.downloadUrl) : undefined;
        const available =
          url?.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          url.pathname !== '/download';
        setDownload(
          available
            ? { url: url.href, version: policy.recommendedVersion, state: 'ready' }
            : { version: policy.recommendedVersion, state: 'unpublished' },
        );
      })
      .catch(() => {
        if (active) setDownload({ version: desktopVersion, state: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <PageShell>
      <section className="download-layout">
        <div className="download-copy">
          <span>Desktop app</span>
          <h1>
            在 Mac 上，
            <br />
            开始标注。
          </h1>
          <p>
            在网页上点选元素、标记截图，并在统一预览中检查和提交。顶部工具栏、项目侧栏与标注记录，组成完整的
            macOS 项目。
          </p>
          <div className="download-actions">
            {download.url ? (
              <Button size="lg" asChild>
                <a href={download.url}>
                  <Download /> 下载 macOS 版
                </a>
              </Button>
            ) : (
              <Button size="lg" disabled>
                <Download />{' '}
                {download.state === 'loading'
                  ? '正在获取下载地址…'
                  : download.state === 'error'
                    ? '下载信息暂不可用'
                    : 'macOS 安装包待发布'}
              </Button>
            )}
            <a href="/docs">
              查看安装与使用文档 <ArrowRight />
            </a>
          </div>
          <small>macOS · Apple silicon（M 系列芯片）</small>
          {download.state === 'error' && (
            <p role="status">暂时无法获取发布信息，请稍后刷新重试。你可以先在线体验标注流程。</p>
          )}
          <a href="/#experience">
            先在线体验 <ArrowRight />
          </a>
        </div>
        <div className="download-product-card">
          <MarkFixMark className="download-app-icon" size={62} />
          <div>
            <span>MarkFix for macOS</span>
            <strong>Version {download.version}</strong>
          </div>
          <Badge variant="secondary">Preview</Badge>
          <div className="download-capability-list">
            <p>
              <MessageSquareText /> 元素级网页批注
            </p>
            <p>
              <Camera /> 矩形、箭头、文字等截图标记
            </p>
            <p>
              <FolderKanban /> 本地 / 云端项目与历史标注
            </p>
            <p>
              <ShieldCheck /> 按页面隔离，回看已有标注
            </p>
          </div>
        </div>
      </section>
      <figure className="download-desktop-preview">
        <img
          src="/marketing/element-annotation.png"
          alt="当前 MarkFix macOS 桌面端：顶部工具栏与右侧标注预览"
          width="1440"
          height="900"
        />
      </figure>
    </PageShell>
  );
}
