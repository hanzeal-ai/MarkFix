import { MarkFixApi } from '@markfix/api-client';

export const adminApi = new MarkFixApi(
  import.meta.env.VITE_API_URL ?? 'http://localhost:4310',
);

export const commercialRequest = <T>(path: string, init?: RequestInit): Promise<T> =>
  adminApi.requestJson<T>(`/v1/commercial${path}`, init);
