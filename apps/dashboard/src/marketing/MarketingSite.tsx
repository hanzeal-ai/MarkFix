import {
  ArrowRight,
  Layers3,
  Camera,
  Check,
  Download,
  FolderKanban,
  MessageSquareText,
} from '@markfix/ui/icons';
import { Badge, Button, Card } from '@markfix/ui';
import { MarketingHeroContent } from './MarketingContent';
import { InteractiveDemo } from './InteractiveDemo';
import { SiteFooter, SiteHeader } from './SiteChrome';
import './premium-marketing.css';

const capabilities = [
  {
    icon: MessageSquareText,
    index: '01',
    title: '元素级批注',
    description:
      '像在 Word 中批注一样，点选网页元素并写下修改建议。再次打开记录，回到对应页面位置。',
    image: '/marketing/element-annotation.png',
    imageAlt: 'MarkFix 元素批注界面，页面元素与右侧批注内容保持关联',
    imageWidth: 1440,
    imageHeight: 900,
  },
  {
    icon: Camera,
    index: '02',
    title: '设计走查与截图标记',
    description: '框选页面区域，使用矩形、椭圆、箭头、画笔、文字、马赛克和序号说明问题。',
    image: '/marketing/screenshot-editor.png',
    imageAlt: 'MarkFix 截图编辑界面，包含区域选择和完整标记工具栏',
    imageWidth: 1440,
    imageHeight: 900,
  },
  {
    icon: FolderKanban,
    index: '03',
    title: '项目化管理',
    description:
      '从项目侧栏切换网站，为不同页面分别保留标注。本地项目在本机保存，云端项目用于工作区协作。',
    image: '/marketing/project-management.png',
    imageAlt: '当前 MarkFix 桌面端项目侧栏与网站工作区',
    imageWidth: 1440,
    imageHeight: 900,
  },
  {
    icon: Layers3,
    index: '04',
    title: '统一预览与提交',
    description: '元素批注、截图与调试证据在同一预览区编号。提交前勾选记录，检查内容后再确认。',
    image: '/marketing/annotation-review.png',
    imageAlt: '当前 MarkFix 桌面端提交预览窗口，可勾选批注与截图记录',
    imageWidth: 1100,
    imageHeight: 768,
  },
];

export function MarketingSite() {
  const experienceDemo = () =>
    document.querySelector('#experience')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="premium-site">
      <SiteHeader />
      <main>
        <section className="premium-hero">
          <MarketingHeroContent onExperience={experienceDemo} />
        </section>

        <section className="premium-capability-section" id="product">
          <div className="premium-editorial-heading">
            <span>One product, complete context</span>
            <h2>从指出问题，到确认修复。</h2>
            <p>每项能力都围绕同一件事：让反馈准确进入开发流程。</p>
          </div>
          <div className="premium-capability-grid">
            {capabilities.map(
              ({
                icon: Icon,
                index,
                title,
                description,
                image,
                imageAlt,
                imageWidth,
                imageHeight,
              }) => (
                <article key={index}>
                  <div className="premium-capability-meta">
                    <span>{index}</span>
                    <Icon />
                  </div>
                  <figure className="premium-capability-visual">
                    <img
                      alt={imageAlt}
                      decoding="async"
                      height={imageHeight}
                      loading="lazy"
                      src={image}
                      width={imageWidth}
                    />
                  </figure>
                  <div className="premium-capability-copy">
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ),
            )}
          </div>
        </section>

        <section className="experience-section" id="experience">
          <div className="premium-demo-heading">
            <span>Live product demo</span>
            <h2>直接在这里体验。</h2>
            <p>点选元素、输入备注，或切换截图模式拖拽标记。体验记录不会上传，刷新后清空。</p>
          </div>
          <InteractiveDemo />
        </section>

        <section className="premium-pricing-home" id="pricing">
          <div className="premium-editorial-heading">
            <span>Simple pricing</span>
            <h2>从个人使用，到团队协作。</h2>
          </div>
          <div className="premium-plan-row">
            <Card className="premium-home-plan">
              <div>
                <span>个人版</span>
                <Badge variant="secondary">本地优先</Badge>
              </div>
              <strong>免费</strong>
              <p>适合个人开发者与独立设计师。</p>
              <ul>
                <li>
                  <Check /> 3 个云端项目
                </li>
                <li>
                  <Check /> 元素与截图标注
                </li>
                <li>
                  <Check /> 本地项目独立保存在本机
                </li>
              </ul>
              <Button variant="outline" onClick={() => window.location.assign('/download')}>
                查看下载
              </Button>
            </Card>
            <Card className="premium-home-plan is-featured">
              <div>
                <span>团队版</span>
                <Badge>即将开放</Badge>
              </div>
              <strong>商业订阅</strong>
              <p>面向需要统一管理反馈与进度的团队。</p>
              <ul>
                <li>
                  <Check /> 团队成员与权限
                </li>
                <li>
                  <Check /> 项目与用户统计
                </li>
                <li>
                  <Check /> 标注处理与驳回
                </li>
              </ul>
              <Button onClick={() => window.location.assign('/pricing')}>查看完整定价</Button>
            </Card>
          </div>
        </section>

        <section className="premium-download-home">
          <div>
            <span>Desktop app</span>
            <h2>在任意网站上，开始标注。</h2>
            <p>MarkFix 桌面端承载完整的网页批注、截图编辑和项目提交体验。</p>
          </div>
          <div>
            <Button size="lg" onClick={() => window.location.assign('/download')}>
              <Download /> 前往下载
            </Button>
            <a href="/docs">
              先阅读文档 <ArrowRight />
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
