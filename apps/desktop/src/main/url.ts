export const normalizeWebsiteUrl = (input: string): string => {
  const trimmed = input.trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  const isAllowedProtocol = url.protocol === 'https:' || url.protocol === 'http:';
  if (!isAllowedProtocol || !url.hostname)
    throw new Error('Enter a valid HTTP or HTTPS website address');
  return url.toString();
};

export const isWebsiteUrlAllowed = (input: string): boolean => {
  try {
    normalizeWebsiteUrl(input);
    return true;
  } catch {
    return false;
  }
};
