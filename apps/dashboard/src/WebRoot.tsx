import { App } from './app/App.js';
import { MarketingSite } from './marketing/MarketingSite.js';

export function WebRoot() {
  return window.location.pathname === '/' ? <MarketingSite /> : <App />;
}
