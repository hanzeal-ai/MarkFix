import { useState } from 'react';
import { Menu } from '@markfix/ui/icons';
import {
  Button,
  MarkFixLogo,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@markfix/ui';

const navigation = [
  { label: '产品', href: '/#product' },
  { label: '在线体验', href: '/#experience' },
  { label: '文档', href: '/docs' },
  { label: 'Agent 接入', href: '/docs#agent' },
  { label: '定价', href: '/pricing' },
  { label: '下载', href: '/download' },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="premium-header">
      <a className="premium-brand" href="/" aria-label="MarkFix 首页">
        <MarkFixLogo />
      </a>
      <nav className="premium-nav" aria-label="主导航">
        {navigation.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
        <Button onClick={() => window.location.assign('/login')}>登录</Button>
      </nav>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button className="premium-menu-button" variant="ghost" size="icon" aria-label="打开菜单">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent className="premium-mobile-nav-sheet">
          <SheetHeader className="sr-only">
            <SheetTitle>网站导航</SheetTitle>
            <SheetDescription>浏览 MarkFix 产品、文档、定价和下载页面。</SheetDescription>
          </SheetHeader>
          <nav className="premium-mobile-nav" aria-label="移动端主导航">
            {navigation.map((item) => (
              <SheetClose asChild key={item.href}>
                <a href={item.href}>{item.label}</a>
              </SheetClose>
            ))}
            <SheetClose asChild>
              <Button onClick={() => window.location.assign('/login')}>登录</Button>
            </SheetClose>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="premium-footer">
      <div>
        <a className="premium-brand" href="/">
          <MarkFixLogo />
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
