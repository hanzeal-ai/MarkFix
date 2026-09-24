import { dashboardServiceUrls, cliFirstUseCommand } from '../service-config';
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
import { StorageGuide, DeveloperGuide } from './EnvironmentGuide';
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
          <a href="#updates">近期更新</a>
          <a href="#storage-mode">本地与云端</a>
          <a href="#elements">元素批注</a>
          <a href="#capture">截图标注</a>
          <a href="#shortcuts">快捷键</a>
          <a href="#agent">Codex 接入</a>
          <a href="#projects">项目管理</a>
          <a href="#development">开发与构建</a>
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
              <li>在页面内填写备注并保存，在右侧预览检查记录</li>
              <li>点击右上角提交按钮，勾选要交给团队或 Codex 的记录</li>
            </ol>
          </article>
          <article id="updates">
            <span>近期更新</span>
            <h2>记录问题与修复进度，更连贯。</h2>
            <ul>
              <li>页内备注：元素与截图均可直接输入，支持 Enter 提交。</li>
              <li>冻结截图：保留触发截图时的画面，选区边缘可调整。</li>
              <li>预览收起后释放页面空间；刷新按钮重新加载当前项目网页。</li>
              <li>本机 CLI：无需云端账号，已提交标注可直接交给 Codex。</li>
              <li>修复回写：查看完成状态、失败原因，断开连接后可补传结果。</li>
            </ul>
          </article>
          <StorageGuide />
          <article id="elements">
            <span>02</span>
            <h2>元素批注</h2>
            <AnnotationShortcutHint mode="element" />
            <p>
              切换到批注模式后，将鼠标移到页面元素上。MarkFix
              会显示当前可选择范围。点击后在页面内填写备注，按 Enter
              或点击提交保存；记录会出现在右侧预览，点击已有记录可以重新编辑。
            </p>
            <div className="docs-callout">
              <MousePointer2 />
              <span>
                <strong>保留开发上下文</strong>
                <small>批注会关联页面地址、元素选择器和视觉位置。</small>
              </span>
            </div>
            <figure className="docs-effect-image">
              <a
                href="/marketing/element-annotation.png"
                target="_blank"
                rel="noreferrer"
                aria-label="查看元素批注效果图原图"
              >
                <img
                  src="/marketing/element-annotation.png"
                  alt="元素批注效果：网页标题高亮选中，在页内填写修改建议并提交保存"
                  width="1440"
                  height="900"
                  loading="lazy"
                  decoding="async"
                />
              </a>
              <figcaption>
                元素批注：选中页面元素，在页面内填写修改建议。<span>点击图片查看原图</span>
              </figcaption>
            </figure>
          </article>
          <article id="capture">
            <span>03</span>
            <h2>截图标注</h2>
            <AnnotationShortcutHint mode="capture" />
            <p>
              进入截图模式会冻结当前画面。拖拽建立选区，可拖动边缘调整大小，再使用矩形、椭圆、箭头、画笔、文字、马赛克和序号工具标记。在工具栏旁填写备注，按
              Enter 或点击提交后在右侧预览。
            </p>
            <div className="docs-tool-list">
              {['调整选区', '矩形', '椭圆', '箭头', '画笔', '文字', '马赛克', '序号'].map(
                (tool) => (
                  <span key={tool}>{tool}</span>
                ),
              )}
            </div>
            <figure className="docs-effect-image">
              <a
                href="/marketing/screenshot-editor.png"
                target="_blank"
                rel="noreferrer"
                aria-label="查看截图标注效果图原图"
              >
                <img
                  src="/marketing/screenshot-editor.png"
                  alt="截图标注效果：冻结网页画面后框选区域，在工具栏旁填写备注并提交"
                  width="1440"
                  height="900"
                  loading="lazy"
                  decoding="async"
                />
              </a>
              <figcaption>
                截图标注：框选区域，使用标记工具说明问题。<span>点击图片查看原图</span>
              </figcaption>
            </figure>
          </article>
          <ShortcutGuide />
          <CliGuide firstUseCommand={cliFirstUseCommand()}>
            {new URL(dashboardServiceUrls().apiOrigin).protocol === 'http:' &&
              !['localhost', '127.0.0.1', '[::1]'].includes(
                new URL(dashboardServiceUrls().apiOrigin).hostname,
              ) && <p>当前服务使用 HTTP，CLI 授权需要服务启用 HTTPS 后才能使用。</p>}
          </CliGuide>
          <DeveloperGuide />
          <article id="projects">
            <span>05</span>
            <h2>项目管理</h2>
            <p>
              项目侧栏用于切换网站，历史标注用于回看记录。本地项目和标注保存在本机；云端项目按项目成员授权，可在管理后台处理与驳回。右侧预览汇总当前项目记录，页面上的标记按对应网址回放。
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
  const [platform, setPlatform] = useState<'darwin' | 'win32'>(() => {
    const requested = new URLSearchParams(window.location.search).get('platform');
    return requested === 'win32' || (!requested && /Windows/i.test(navigator.userAgent))
      ? 'win32'
      : 'darwin';
  });
  const windows = platform === 'win32';
  const platformLabel = windows ? 'Windows' : 'macOS';
  const [download, setDownload] = useState<{
    url?: string;
    distribution?: 'trial' | 'signed' | undefined;
    version: string;
    state: 'loading' | 'ready' | 'unpublished' | 'error';
  }>({ version: desktopVersion, state: 'loading' });
  useEffect(() => {
    let active = true;
    setDownload({ version: desktopVersion, state: 'loading' });
    const api = new MarkFixApi(dashboardServiceUrls().apiOrigin);
    void api
      .clientPolicy(desktopVersion, platform, windows ? 'x64' : 'arm64')
      .then((policy) => {
        if (!active) return;
        const url = policy.downloadUrl ? new URL(policy.downloadUrl) : undefined;
        const available =
          url?.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          url.pathname !== '/download' &&
          (!windows || url.pathname.toLowerCase().endsWith('.exe'));
        setDownload(
          available
            ? {
                url: url.href,
                version: policy.recommendedVersion,
                distribution: policy.distribution,
                state: 'ready',
              }
            : { version: policy.recommendedVersion, state: 'unpublished' },
        );
      })
      .catch(() => {
        if (active) setDownload({ version: desktopVersion, state: 'error' });
      });
    return () => {
      active = false;
    };
  }, [platform, windows]);
  return (
    <PageShell>
      <section className="download-layout">
        <div className="download-copy">
          <span>Desktop app</span>
          <h1>
            在电脑上，
            <br />
            开始标注。
          </h1>
          <p>
            在网页上点选元素、标记截图，并在统一预览中检查和提交。顶部工具栏、项目侧栏与标注记录，组成完整的
            桌面工作区。
          </p>
          <div className="download-platforms" role="group" aria-label="选择操作系统">
            <Button
              variant={windows ? 'outline' : 'default'}
              aria-pressed={!windows}
              disabled={!windows}
              onClick={() => {
                setDownload({ version: desktopVersion, state: 'loading' });
                setPlatform('darwin');
              }}
            >
              macOS
            </Button>
            <Button
              variant={windows ? 'default' : 'outline'}
              aria-pressed={windows}
              disabled={windows}
              onClick={() => {
                setDownload({ version: desktopVersion, state: 'loading' });
                setPlatform('win32');
              }}
            >
              Windows
            </Button>
          </div>
          <div className="download-actions">
            {download.url ? (
              <Button size="lg" asChild>
                <a href={download.url}>
                  <Download /> 下载 {platformLabel} 版
                </a>
              </Button>
            ) : (
              <Button size="lg" disabled>
                <Download />{' '}
                {download.state === 'loading'
                  ? '正在获取下载地址…'
                  : download.state === 'error'
                    ? '下载信息暂不可用'
                    : `${platformLabel} 安装包待发布`}
              </Button>
            )}
            <a href="/docs">
              查看安装与使用文档 <ArrowRight />
            </a>
          </div>
          <small>
            {windows
              ? 'Windows · x64（Intel / AMD 64 位）· 手动安装更新'
              : 'macOS · Apple silicon（M 系列芯片）'}
          </small>
          {download.distribution === 'trial' && (
            <p role="note">
              未签名试用版：安装时系统可能提示无法验证发布者。请核对下载来源；更新需手动下载安装。
              {!windows && '如 macOS 阻止打开，可在系统设置的“隐私与安全性”中核对并允许打开。'}
            </p>
          )}
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
            <span>MarkFix for {platformLabel}</span>
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
