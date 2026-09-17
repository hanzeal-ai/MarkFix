export const diagnosticTextLimit = 20_000;
const sensitive = /authorization|cookie|password|passwd|secret|token|api[-_]?key|session/i;

export const sanitizeDiagnosticValue = (text: string): string => {
  const scrub = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          sensitive.test(key) ? '[REDACTED]' : scrub(item),
        ]),
      );
    return typeof value === 'string' ? redact(value) : value;
  };
  const redact = (value: string): string =>
    value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(
        /((?:authorization|proxy-authorization|cookie|set-cookie|x-api-key)\s*:\s*)[^\r\n'"]+/gi,
        '$1[REDACTED]',
      )
      .replace(
        /((?:password|passwd|secret|token|api[_-]?key|session|auth)[\w-]*["']?\s*[:=]\s*["']?)[^\s&,"'<>}]+/gi,
        '$1[REDACTED]',
      );
  try {
    return JSON.stringify(scrub(JSON.parse(text)), null, 2);
  } catch {
    if (/^[^\s=&]+=[^\r\n]*$/.test(text) && !text.includes('://')) {
      const params = new URLSearchParams(text);
      for (const [key, value] of params)
        params.set(key, sensitive.test(key) ? '[REDACTED]' : redact(value));
      return params.toString();
    }
    return redact(text);
  }
};

export const diagnosticBody = (text: string) => {
  const safe = sanitizeDiagnosticValue(text);
  return {
    body: safe.slice(0, diagnosticTextLimit),
    bodyState: !text
      ? ('empty' as const)
      : safe.length > diagnosticTextLimit
        ? ('truncated' as const)
        : ('captured' as const),
  };
};

export const diagnosticHeaders = (input: unknown): Record<string, string> => {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(
    Object.entries(input)
      .slice(0, 100)
      .map(([key, value]) => [
        key.slice(0, 200),
        sensitive.test(key) ? '[REDACTED]' : sanitizeDiagnosticValue(String(value)).slice(0, 2000),
      ]),
  );
};
export const textResponse = (mime: string): boolean =>
  !mime || /json|text|xml|javascript|x-www-form-urlencoded|graphql/i.test(mime);
