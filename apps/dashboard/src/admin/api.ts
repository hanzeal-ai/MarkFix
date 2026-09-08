import { MarkFixApi } from '@markfix/api-client';

const adminApiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4310';

export const adminApi = new MarkFixApi(adminApiBaseUrl);

export const resolveAdminAssetUrl = (path: string): string =>
  new URL(
    path,
    new URL(`${adminApiBaseUrl.replace(/\/+$/, '')}/`, window.location.origin),
  ).toString();

export const commercialRequest = <T>(path: string, init?: RequestInit): Promise<T> =>
  adminApi.requestJson<T>(`/v1/commercial${path}`, init);
