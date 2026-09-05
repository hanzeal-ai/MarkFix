import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from '@markfix/ui';
import { WebRoot } from './WebRoot.js';
import { topLevelRoute } from './routes.js';
import './styles.css';

const AccountAccess = React.lazy(() =>
  import('./account/AccountAccess.js').then((module) => ({ default: module.AccountAccess })),
);
const AccountSettings = React.lazy(() =>
  import('./account/AccountSettings.js').then((module) => ({ default: module.AccountSettings })),
);
const LegalPage = React.lazy(() =>
  import('./legal/LegalPage.js').then((module) => ({ default: module.LegalPage })),
);

const route = topLevelRoute(window.location.pathname);

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
  <React.StrictMode>
    <React.Suspense fallback={<main className="loading">正在打开 MarkFix…</main>}>
      {route === 'account-access' ? (
        <AccountAccess />
      ) : route === 'account-settings' ? (
        <AccountSettings />
      ) : route === 'legal' ? (
        <LegalPage />
      ) : (
        <WebRoot />
      )}
    </React.Suspense>
    <Toaster position="bottom-center" richColors closeButton />
  </React.StrictMode>,
);
