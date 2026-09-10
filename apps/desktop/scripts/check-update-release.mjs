import { serviceUrls } from '../../../packages/contracts/src/service-config.ts';
import process from 'node:process';
import { URL } from 'node:url';

const url = new URL(serviceUrls('production', process.env.MARKFIX_SERVICE_ORIGIN).origin);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
  throw new Error(
    'Set the shared service origin (or MARKFIX_SERVICE_ORIGIN) to HTTPS before building an update release.',
  );
}
