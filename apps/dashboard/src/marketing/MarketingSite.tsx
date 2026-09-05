import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  Layers3,
  Menu,
  MessageSquareText,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  X,
} from '@markfix/ui/icons';
import { Badge, Button, Card } from '@markfix/ui';
import './marketing.css';

const workflow = [
  {
    icon: MousePointer2,
    index: '01',
    title: '直接标在网页上',
    description: '选择页面元素或任意区域，像 Word 批注一样留下清晰、准确的反馈。',
  },
  {
    icon: MessageSquareText,
    index: '02',
    title: '上下文自动整理',
    description: '页面地址、元素信息、截图与复现线索一起保存，减少来回确认。',
  },
  {
    icon: CheckCircle2,
    index: '03',
    title: '集中处理与验收',
    description: '在管理后台分配、跟进和驳回标注，让每条反馈都有结果。',
  },
];

const features = [
  {
    icon: Layers3,
    title: '项目化管理',
    description: '按网站和业务类型组织标注，项目进度与待办一目了然。',
  },
  {
    icon: BarChart3,
    title: '多维统计',
    description: '按项目或用户查看标注数量、处理进度与驳回情况。',
  },
  {
    icon: ShieldCheck,
    title: '清晰权限边界',
    description: '工作区成员隔离，管理操作只对负责人和管理员开放。',
  },
];

const plans = [
  {
    name: '个人版',
    price: '免费',
    note: '适合个人开发者与独立设计师',
    items: ['3 个标注项目', '基础标注与截图', '本地数据管理'],
  },
  {
    name: '团队版',
    price: '即将开放',
    note: '适合产品、设计与研发团队',
    items: ['不限项目数量', '团队成员与权限', '统计总览与完整记录'],
    featured: true,
  },
];

const go = (path: string) => {
  window.location.assign(path);
};

export function MarketingSite() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="marketing-site">
      <header className="marketing-header">
        <a className="marketing-brand" href="/" aria-label="MarkFix 首页">
          <span aria-hidden="true">M</span>
          MarkFix
        </a>
        <nav className={menuOpen ? 'marketing-nav is-open' : 'marketing-nav'} aria-label="主导航">
          <a href="#workflow" onClick={() => setMenuOpen(false)}>
            工作方式
          </a>
          <a href="#features" onClick={() => setMenuOpen(false)}>
            产品能力
          </a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>
            版本
          </a>
          <Button variant="ghost" onClick={() => go('/login')}>
            登录
          </Button>
          <Button onClick={() => go('/app')}>进入管理后台</Button>
        </nav>
        <Button
          className="marketing-menu-button"
          variant="ghost"
          size="icon"
          aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X /> : <Menu />}
        </Button>
      </header>

      <main>
        <section className="marketing-hero">
          <div className="hero-copy">
            <Badge variant="secondary">
              <Sparkles /> Mark It! Fix It!
            </Badge>
            <h1>把网页问题，直接标在问题发生的地方。</h1>
            <p>
              MarkFix 把 Word
              式批注带到任意网站。产品、设计和研发共享同一份页面上下文，反馈更准确，修复更快。
            </p>
            <div className="hero-actions">
              <Button size="lg" onClick={() => go('/app')}>
                查看管理后台 <ArrowRight />
              </Button>
              <Button size="lg" variant="outline" onClick={() => go('/login')}>
                登录本地工作区
              </Button>
            </div>
            <div className="hero-proof" aria-label="核心能力">
              <span>
                <Check /> 元素级标注
              </span>
              <span>
                <Check /> 截图批注
              </span>
              <span>
                <Check /> 团队处理闭环
              </span>
            </div>
          </div>

          <div className="product-stage" aria-label="MarkFix 产品界面示意">
            <div className="browser-frame">
              <div className="browser-toolbar">
                <span className="window-dot" />
                <span className="window-dot" />
                <span className="window-dot" />
                <div className="address-bar">markfix.local/pricing</div>
              </div>
              <div className="browser-content">
                <div className="demo-page">
                  <span className="demo-kicker">Simple visual feedback</span>
                  <h2>Ship the right fix, faster.</h2>
                  <p>Capture context your team can actually use.</p>
                  <div className="demo-buttons">
                    <span>Start for free</span>
                    <span>See how it works</span>
                  </div>
                  <div className="annotation-outline">
                    <span>1</span>
                  </div>
                </div>
                <aside className="comment-rail">
                  <div className="rail-title">
                    <span>批注</span>
                    <Badge variant="secondary">3</Badge>
                  </div>
                  <Card className="comment-card is-active">
                    <div className="comment-meta">
                      <span className="avatar">林</span>
                      <span>林乔 · 刚刚</span>
                    </div>
                    <strong>主按钮需要更明确</strong>
                    <p>建议改成“开始标注”，让用户一眼理解下一步。</p>
                  </Card>
                  <Card className="comment-card">
                    <div className="comment-meta">
                      <span className="avatar">周</span>
                      <span>周然 · 12 分钟前</span>
                    </div>
                    <strong>已补充响应式状态</strong>
                    <p>390px 宽度下已验证。</p>
                  </Card>
                </aside>
              </div>
            </div>
            <div className="floating-status">
              <CheckCircle2 />
              <div>
                <strong>上下文已记录</strong>
                <span>页面、元素、截图与复现线索</span>
              </div>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="适用团队">
          <span>适用于</span>
          <strong>产品团队</strong>
          <strong>设计评审</strong>
          <strong>研发验收</strong>
          <strong>客户支持</strong>
        </section>

        <section className="marketing-section" id="workflow">
          <div className="section-heading">
            <span>清晰的工作闭环</span>
            <h2>从发现问题到确认修复，只需三步。</h2>
            <p>不用重新描述页面位置，也不用在聊天记录里寻找那张截图。</p>
          </div>
          <div className="workflow-grid">
            {workflow.map(({ icon: Icon, index, title, description }) => (
              <article key={index}>
                <div className="workflow-topline">
                  <span>{index}</span>
                  <Icon />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section feature-section" id="features">
          <div className="feature-preview">
            <div className="preview-sidebar">
              <span className="preview-logo">M</span>
              <i className="active" />
              <i />
              <i />
            </div>
            <div className="preview-main">
              <div className="preview-heading">
                <div>
                  <span>统计总览</span>
                  <strong>今天也在稳定推进</strong>
                </div>
                <span className="preview-filter">本月</span>
              </div>
              <div className="preview-metrics">
                <div>
                  <span>标注项目</span>
                  <strong>12</strong>
                </div>
                <div>
                  <span>全部标注</span>
                  <strong>284</strong>
                </div>
                <div>
                  <span>待处理</span>
                  <strong>36</strong>
                </div>
              </div>
              <div className="preview-chart">
                {[42, 58, 48, 72, 66, 86, 76, 96].map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
          </div>
          <div className="feature-copy">
            <span>把反馈变成可管理的工作</span>
            <h2>不只记录问题，也看得见团队进度。</h2>
            <p>
              每个标注都归属于明确的项目、页面和提交人。负责人可以集中处理，管理者可以从项目与用户两个维度了解进展。
            </p>
            <div className="feature-list">
              {features.map(({ icon: Icon, title, description }) => (
                <div key={title}>
                  <Icon />
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section pricing-section" id="pricing">
          <div className="section-heading">
            <span>从本地开始</span>
            <h2>先把反馈流程跑顺，再决定如何扩展。</h2>
            <p>当前版本聚焦本地可用的标注与管理闭环，商业订阅将在产品验证后开放。</p>
          </div>
          <div className="pricing-grid">
            {plans.map((plan) => (
              <Card
                className={plan.featured ? 'pricing-card is-featured' : 'pricing-card'}
                key={plan.name}
              >
                <div className="pricing-name">
                  <span>{plan.name}</span>
                  {plan.featured && <Badge>推荐</Badge>}
                </div>
                <strong>{plan.price}</strong>
                <p>{plan.note}</p>
                <ul>
                  {plan.items.map((item) => (
                    <li key={item}>
                      <Check /> {item}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.featured ? 'default' : 'outline'}
                  onClick={() => go(plan.featured ? '/app' : '/login')}
                >
                  {plan.featured ? '查看团队后台' : '开始使用'} <ArrowUpRight />
                </Button>
              </Card>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <div>
            <span>Mark It! Fix It!</span>
            <h2>让每一条网页反馈，都有准确的落点。</h2>
          </div>
          <Button size="lg" onClick={() => go('/app')}>
            进入管理后台 <ArrowRight />
          </Button>
        </section>
      </main>

      <footer className="marketing-footer">
        <a className="marketing-brand" href="/">
          <span aria-hidden="true">M</span>
          MarkFix
        </a>
        <p>为网站团队打造的可视化反馈工具。</p>
        <span>本地展示版 · 2026</span>
      </footer>
    </div>
  );
}
