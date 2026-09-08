import process from 'node:process';
import { URL } from 'node:url';

const url = new URL(process.env.MAIN_VITE_API_URL ?? 'http://invalid.local');
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
  throw new Error(
    'Set MAIN_VITE_API_URL to the production HTTPS API before building an update release.',
  );
}
