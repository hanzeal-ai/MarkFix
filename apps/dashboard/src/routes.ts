export type TopLevelRoute = 'account-access' | 'account-settings' | 'legal' | 'application';

const accountAccessPaths = new Set([
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/accept-invitation',
]);

export const topLevelRoute = (pathname: string): TopLevelRoute => {
  if (accountAccessPaths.has(pathname)) return 'account-access';
  if (pathname === '/account') return 'account-settings';
  if (pathname === '/privacy' || pathname === '/terms') return 'legal';
  return 'application';
};
