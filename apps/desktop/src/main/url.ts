export const normalizeWebsiteUrl = (input: string, allowHttp = false): string => {
  const trimmed = input.trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  const isAllowedProtocol = url.protocol === 'https:' || (allowHttp && url.protocol === 'http:');
  if (!isAllowedProtocol || !url.hostname) throw new Error('Enter a valid HTTPS website address');
  return url.toString();
};
