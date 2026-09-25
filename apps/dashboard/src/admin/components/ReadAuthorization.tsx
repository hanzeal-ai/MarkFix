import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnnotationReadAuthorization } from '@markfix/contracts';
import { Alert, AlertDescription, Button, Input } from '@markfix/ui';
import { adminApi } from '../api';

export function ReadAuthorization({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const client = useQueryClient();
  const path = `/v1/projects/${projectId}/read-authorization`;
  const queryKey = ['read-authorization', projectId];
  const status = useQuery({
    queryKey,
    enabled: open,
    retry: false,
    queryFn: () => adminApi.requestJson<AnnotationReadAuthorization>(path),
  });
  async function change(method: 'POST' | 'DELETE') {
    setBusy(true);
    setError('');
    setMessage('');
    setAddress('');
    try {
      const data = await adminApi.requestJson<AnnotationReadAuthorization>(path, { method });
      client.setQueryData(queryKey, { active: data.active, expiresAt: data.expiresAt });
      setAddress(data.authorizationUrl ?? '');
      setMessage(
        method === 'DELETE'
          ? '授权已撤销，旧地址不能继续读取。'
          : '授权地址仅显示一次，请复制后妥善保存。',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '授权操作失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="annotation-read-authorization"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>读取授权</summary>
      <p>
        允许外部工具只读获取你在此项目提交的未处理或修复失败标注。不能读取其他成员的标注，也不能修改或执行任务。
      </p>
      {status.isPending && open && <p>正在读取授权状态…</p>}
      {status.error && (
        <Alert variant="destructive">
          <AlertDescription>授权状态读取失败，请重新打开后重试。</AlertDescription>
        </Alert>
      )}
      {status.data && (
        <>
          <p>
            {status.data.active && status.data.expiresAt
              ? `有效期至 ${new Date(status.data.expiresAt).toLocaleDateString()}；重新生成会使旧地址失效。`
              : '尚无有效授权。新授权有效期为 90 天，可随时撤销。'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void change('POST')}>
              {status.data.active ? '重新生成授权地址' : '生成授权地址'}
            </Button>
            {status.data.active && (
              <Button variant="outline" disabled={busy} onClick={() => void change('DELETE')}>
                撤销授权
              </Button>
            )}
          </div>
        </>
      )}
      {address && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            aria-label="授权地址"
            readOnly
            value={address}
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(address).then(
                () => setMessage('已复制授权地址。'),
                () => setMessage('请选中上方地址手动复制。'),
              )
            }
          >
            复制地址
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
