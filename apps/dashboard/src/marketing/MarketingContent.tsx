import type { ReactNode } from 'react';
import { ArrowRight, Check, Download } from '@markfix/ui/icons';
import { Badge, Button, Card } from '@markfix/ui';

export type RenderMarketingTarget = (
  id: string,
  label: string,
  selector: string,
  content: ReactNode,
) => ReactNode;
const renderContent: RenderMarketingTarget = (_id, _label, _selector, content) => content;

export function MarketingHeroContent({
  onExperience,
  renderTarget = renderContent,
}: {
  onExperience: () => void;
  renderTarget?: RenderMarketingTarget;
}) {
  return (
    <>
      <div className="premium-hero-kicker">
        <span>Visual feedback for the web</span>
        <i />
        <span>MarkFix</span>
      </div>
      {renderTarget(
        'headline',
        '页面主标题',
        '.premium-hero h1',
        <h1>
          <span>Mark It!</span> <span>Fix It!</span>
        </h1>,
      )}
      {renderTarget(
        'description',
        '产品说明',
        '.premium-hero > p',
        <p>像在 Word 里写批注一样，在网页上选中问题、标记截图，把上下文交给研发。</p>,
      )}
      {renderTarget(
        'primary-action',
        '主要操作按钮',
        '.premium-hero-actions',
        <div className="premium-hero-actions">
          <Button size="lg" onClick={onExperience}>
            在线体验 <ArrowRight />
          </Button>
          <Button size="lg" variant="outline" onClick={() => window.location.assign('/download')}>
            <Download /> 下载 macOS 桌面端
          </Button>
        </div>,
      )}
      <div className="premium-product-note">
        <span>元素批注</span>
        <span>截图标记</span>
        <span>项目管理</span>
        <span>统一预览</span>
      </div>
      {renderTarget(
        'product-visual',
        '产品截图',
        '.grida-product-frame',
        <figure className="grida-product-frame">
          <img
            src="/marketing/element-annotation.png"
            alt="MarkFix 桌面端网页元素批注项目"
            width="1440"
            height="900"
          />
        </figure>,
      )}
    </>
  );
}

export function MarketingPricingContent({
  renderTarget = renderContent,
}: {
  renderTarget?: RenderMarketingTarget;
}) {
  return (
    <>
      {renderTarget(
        'pricing-headline',
        '价格页标题',
        '.commercial-page-hero',
        <section className="commercial-page-hero is-centered">
          <span>Pricing</span>
          <h1>简单、明确的版本规划。</h1>
          <p>
            桌面端支持本地项目和云端项目。以下云端额度按订阅区分，本地项目独立保存在本机；团队商业订阅尚未开放。
          </p>
        </section>,
      )}
      <section className="commercial-pricing-grid">
        {renderTarget(
          'personal-plan',
          '个人版方案',
          '.commercial-price-card',
          <Card className="commercial-price-card">
            <div>
              <span>个人版</span>
              <Badge variant="secondary">当前可用</Badge>
            </div>
            <strong>免费</strong>
            <p>个人开发者、独立设计师和小型项目。</p>
            <ul>
              <li>
                <Check /> 3 个云端项目
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
          </Card>,
        )}
        {renderTarget(
          'team-plan',
          '团队版方案',
          '.commercial-price-card.is-featured',
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
          </Card>,
        )}
      </section>
    </>
  );
}
