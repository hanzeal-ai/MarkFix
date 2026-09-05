import type { Anchor, Annotation } from '@markfix/contracts';

export type BrowserState = {
  url?: string;
  pageTitle?: string;
  pageSessionId?: string;
  loading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  faviconUrl?: string | null;
  error?: string | null;
  loadFailure?: {
    url: string;
    description: string;
    code?: number;
    message: string;
  } | null;
};

export type DesktopUser = { id: string; email: string; displayName: string };
export type CaptureSelection = Extract<Anchor, { kind: 'region' }>;
export type CaptureSource = { dataUrl: string; captureScale: number };

export const annotationName = (annotation: Annotation): string => {
  if (annotation.type === 'pin') return `Pin ${annotation.label}`;
  if (annotation.type === 'text') return annotation.text;
  if (annotation.type === 'pen') return 'Freehand mark';
  return annotation.type === 'arrow' ? 'Arrow' : 'Rectangle';
};

export const elementAnchorsEqual = (
  left: Extract<Anchor, { kind: 'element' }>,
  right: Extract<Anchor, { kind: 'element' }>,
): boolean => {
  if (left.documentUrl !== right.documentUrl) return false;
  if (JSON.stringify(left.framePath) !== JSON.stringify(right.framePath)) return false;
  if (left.cssSelector !== right.cssSelector) return false;
  const selectorIsOnlyTag = /^[a-z][a-z0-9-]*$/i.test(left.cssSelector);
  return !selectorIsOnlyTag || left.textQuote === right.textQuote;
};
