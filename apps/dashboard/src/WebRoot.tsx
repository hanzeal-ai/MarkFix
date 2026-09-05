import { lazy, Suspense } from 'react';

const MarketingSite = lazy(() =>
  import('./marketing/MarketingSite.js').then((module) => ({ default: module.MarketingSite })),
);
const AdminApp = lazy(() =>
  import('./admin/AdminApp.js').then((module) => ({ default: module.AdminApp })),
);
const AdminLogin = lazy(() =>
  import('./admin/AdminLogin.js').then((module) => ({ default: module.AdminLogin })),
);
const DocsPage = lazy(() =>
  import('./marketing/CommercialPages.js').then((module) => ({ default: module.DocsPage })),
);
const PricingPage = lazy(() =>
  import('./marketing/CommercialPages.js').then((module) => ({ default: module.PricingPage })),
);
const DownloadPage = lazy(() =>
  import('./marketing/CommercialPages.js').then((module) => ({ default: module.DownloadPage })),
);

export function WebRoot() {
  const pathname = window.location.pathname;
  const page = pathname.startsWith('/app') ? (
    <AdminApp />
  ) : pathname === '/login' ? (
    <AdminLogin />
  ) : pathname === '/docs' ? (
    <DocsPage />
  ) : pathname === '/pricing' ? (
    <PricingPage />
  ) : pathname === '/download' ? (
    <DownloadPage />
  ) : (
    <MarketingSite />
  );
  return <Suspense fallback={<main className="loading">正在打开 MarkFix…</main>}>{page}</Suspense>;
}
