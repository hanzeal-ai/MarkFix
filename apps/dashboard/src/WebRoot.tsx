import { AgentAccess } from './agent/AgentAccess.js';
import { lazy, Suspense } from 'react';

const MarketingSite = lazy(() =>
  import('./marketing/MarketingSite.js').then((module) => ({ default: module.MarketingSite })),
);
const AdminEntry = lazy(() =>
  import('./admin/AdminEntry.js').then((module) => ({ default: module.AdminEntry })),
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
  const page = pathname.startsWith('/agent') ? (
    <AgentAccess />
  ) : pathname.startsWith('/app') ? (
    <AdminEntry />
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
