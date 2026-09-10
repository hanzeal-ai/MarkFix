import { useEffect, useState } from 'react';
import { Alert, AlertDescription, Button, Card, Checkbox, Label } from '@markfix/ui';
import type { AgentGrantSummary, Project } from '@markfix/contracts';
import { adminApi } from '../admin/api.js';
import '../account/account-settings.css';
const request = <T,>(path: string, init?: RequestInit) =>
  adminApi.requestJson<T>(`/v1/agent${path}`, init);
export function AgentAccess() {
  const code = new URLSearchParams(window.location.search).get('code');
  const [device, setDevice] = useState<{
    deviceName: string;
    agentType: string;
    status: string;
    expiresAt: string;
  }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [grants, setGrants] = useState<AgentGrantSummary[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void adminApi
      .me()
      .then(async () => {
        const [items, connections, pending] = await Promise.all([
          adminApi.listProjects(),
          request<AgentGrantSummary[]>('/grants'),
          code
            ? request<{ deviceName: string; agentType: string; status: string; expiresAt: string }>(
                `/device/${encodeURIComponent(code)}`,
              )
            : undefined,
        ]);
        if (active) {
          setProjects(items);
          setGrants(connections);
          setDevice(pending);
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if ((cause as { status?: number }).status === 401)
          window.location.assign(
            `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          );
        else setError(cause instanceof Error ? cause.message : '无法读取授权信息');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);
  async function decide(approve: boolean) {
    setBusy(true);
    setError('');
    try {
      await request('/device/decision', {
        method: 'POST',
        body: JSON.stringify({ userCode: code, approve, projectIds: selected }),
      });
      setMessage(approve ? '已授权，请返回终端完成设置。' : '已拒绝本次授权。');
      setDevice(undefined);
      setGrants(await request<AgentGrantSummary[]>('/grants'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '授权失败');
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError('');
    try {
      await request(`/grants/${id}`, { method: 'DELETE' });
      setGrants(await request<AgentGrantSummary[]>('/grants'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '撤销失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-settings-shell">
      <a className="account-settings-back" href="/app">
        返回管理后台
      </a>
      <h1>Agent 接入</h1>
      {loading && <p>正在读取授权信息…</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && <p role="status">{message}</p>}
      {device && (
        <Card className="agent-access-card">
          <h2>授权 {device.agentType} 访问 MarkFix</h2>
          <p>
            设备：{device.deviceName} · 核对终端授权码：<strong>{code}</strong>
          </p>
          <p>
            允许上报仓库名称，读取所选项目的标注与截图，领取问题并回写修复结果。访问仍受你的项目角色限制。
          </p>
          {device.status === 'PENDING' ? (
            <>
              <fieldset>
                <legend>允许访问的项目</legend>
                {projects.map((project) => (
                  <Label key={project.id} className="agent-project-choice">
                    <Checkbox
                      checked={selected.includes(project.id)}
                      onCheckedChange={(checked) =>
                        setSelected((items) =>
                          checked
                            ? [...items, project.id]
                            : items.filter((id) => id !== project.id),
                        )
                      }
                    />
                    {project.name}
                  </Label>
                ))}
                {!projects.length && <p>暂无可授权项目，请先创建项目或接受项目邀请。</p>}
              </fieldset>
              <div className="agent-actions">
                <Button disabled={busy || !selected.length} onClick={() => void decide(true)}>
                  授权此设备
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
                  拒绝
                </Button>
              </div>
            </>
          ) : (
            <p>本次请求已处理，请返回终端。</p>
          )}
        </Card>
      )}
      <h2>已授权设备</h2>
      {!loading && !grants.length && <p>暂无设备授权。首次使用 CLI 时会自动打开浏览器发起授权。</p>}
      {grants.map((grant) => (
        <Card key={grant.id} className="agent-access-card">
          <strong>{grant.deviceName}</strong>
          <p>
            {grant.agentType} · {grant.projectIds.length} 个项目 ·{' '}
            {grant.revokedAt
              ? '已撤销'
              : new Date(grant.expiresAt) <= new Date()
                ? '已过期'
                : '已授权'}
          </p>
          <p>最近使用：{new Date(grant.lastUsedAt).toLocaleString()}</p>
          {!grant.revokedAt && (
            <Button variant="outline" disabled={busy} onClick={() => void revoke(grant.id)}>
              撤销授权
            </Button>
          )}
        </Card>
      ))}
    </main>
  );
}
