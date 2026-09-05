import { App } from './app/App.js';
import { AdminApp } from './admin/AdminApp.js';
import { MarketingSite } from './marketing/MarketingSite.js';

export function WebRoot() {
  if (window.location.pathname === '/') return <MarketingSite />;
  if (window.location.pathname.startsWith('/app')) return <AdminApp />;
  return <App />;
}
