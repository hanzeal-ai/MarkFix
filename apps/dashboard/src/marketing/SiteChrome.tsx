import { useState } from 'react';
import { Menu, X } from '@markfix/ui/icons';
import { Button } from '@markfix/ui';

const navigation = [
  { label: '产品', href: '/#product' },
  { label: '在线体验', href: '/#experience' },
  { label: '文档', href: '/docs' },
  { label: '定价', href: '/pricing' },
  { label: '下载', href: '/download' },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="premium-header">
      <a className="premium-brand" href="/" aria-label="MarkFix 首页">
        <span aria-hidden="true">M</span>
        MarkFix
      </a>
      <nav className={menuOpen ? 'premium-nav is-open' : 'premium-nav'} aria-label="主导航">
        {navigation.map((item) => (
          <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
            {item.label}
          </a>
        ))}
        <Button onClick={() => window.location.assign('/login')}>登录</Button>
      </nav>
      <Button
        className="premium-menu-button"
        variant="ghost"
        size="icon"
        aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((current) => !current)}
      >
        {menuOpen ? <X /> : <Menu />}
      </Button>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="premium-footer">
      <div>
        <a className="premium-brand" href="/">
          <span>M</span>
          MarkFix
        </a>
        <p>Mark It! Fix It!</p>
      </div>
      <div className="premium-footer-links">
        <section>
          <strong>产品</strong>
          <a href="/#experience">在线体验</a>
          <a href="/pricing">定价</a>
          <a href="/download">下载</a>
        </section>
        <section>
          <strong>资源</strong>
          <a href="/docs">使用文档</a>
          <a href="/docs#capture">截图标注</a>
          <a href="/docs#projects">项目管理</a>
        </section>
        <section>
          <strong>账户</strong>
          <a href="/app">管理后台</a>
          <a href="/login">登录</a>
        </section>
      </div>
      <div className="premium-footer-meta">
        <small>© 2026 MarkFix</small>
        <span>本地优先 · 数据边界清晰</span>
      </div>
    </footer>
  );
}
