import { serviceUrls } from '@markfix/contracts';

export const apiServiceUrls = () =>
  serviceUrls(
    process.env.MARKFIX_SERVICE_MODE ?? process.env.NODE_ENV ?? 'development',
    process.env.MARKFIX_SERVICE_ORIGIN,
  );
