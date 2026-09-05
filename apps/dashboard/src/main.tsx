import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebRoot } from './WebRoot.js';
import './styles.css';

const AccountAccess = React.lazy(() =>
  import('./account/AccountAccess.js').then((module) => ({ default: module.AccountAccess })),
);

const accountPaths = new Set([
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/accept-invitation',
]);

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <React.Suspense fallback={<main className="loading">正在打开 MarkFix…</main>}>
        {accountPaths.has(window.location.pathname) ? <AccountAccess /> : <WebRoot />}
      </React.Suspense>
    </QueryClientProvider>
  </React.StrictMode>,
);
