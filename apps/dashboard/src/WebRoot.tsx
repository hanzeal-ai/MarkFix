import { lazy, Suspense } from 'react';

const MarketingSite = lazy(() =>
  import('./marketing/MarketingSite.js').then((module) => ({ default: module.MarketingSite })),
);
const AdminApp = lazy(() =>
  import('./admin/AdminApp.js').then((module) => ({ default: module.AdminApp })),
);
const LegacyApp = lazy(() => import('./app/App.js').then((module) => ({ default: module.App })));

export function WebRoot() {
  const page =
    window.location.pathname === '/' ? (
      <MarketingSite />
    ) : window.location.pathname.startsWith('/app') ? (
      <AdminApp />
    ) : (
      <LegacyApp />
    );
  return <Suspense fallback={<main className="loading">正在打开 MarkFix…</main>}>{page}</Suspense>;
}
