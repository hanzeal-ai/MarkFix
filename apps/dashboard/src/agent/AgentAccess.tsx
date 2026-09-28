import { useEffect, useState } from 'react';
import { Alert, AlertDescription, Button, Card, Checkbox, Label } from '@markfix/ui';
import type { AgentDeviceRequestSummary, AgentGrantSummary, Project } from '@markfix/contracts';
import { adminApi } from '../admin/api.js';
import '../account/account-settings.css';
import './agent-access.css';
const request = <T,>(path: string, init?: RequestInit) =>
  adminApi.requestJson<T>(`/v1/agent${path}`, init);
export function AgentAccess({ embedded = false }: { embedded?: boolean }) {
  const code = embedded ? null : new URLSearchParams(window.location.search).get('code');
  const Container = embedded ? 'section' : 'main';
  const [device, setDevice] = useState<{
    deviceName: string;
    agentType: string;
    status: string;
    expiresAt: string;
  }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [requests, setRequests] = useState<AgentDeviceRequestSummary[]>([]);
  const [account, setAccount] = useState('');
  const [grants, setGrants] = useState<AgentGrantSummary[]>([]);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<'approved' | 'denied'>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!embedded && !code) {
      window.location.replace('/account#agent-authorizations');
      return;
    }
    let active = true;
    void adminApi
      .me()
      .then(async (user) => {
        if (active) setAccount(user.email);
        const inbox = await adminApi.agentRequests();
        if (active) setRequests(inbox);
        const [items, connections, pending] = await Promise.all([
          adminApi.listProjects(),
          code ? Promise.resolve([]) : request<AgentGrantSummary[]>('/grants'),
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
          if (pending?.status === 'APPROVED' || pending?.status === 'CONSUMED')
            setDecision('approved');
          if (pending?.status === 'DENIED') setDecision('denied');
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if ((cause as { status?: number }).status === 401)
          window.location.replace(
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
  }, [code, embedded]);
  useEffect(() => {
    if (!decision) return;
    const timer = window.setTimeout(() => window.close(), 1200);
    return () => window.clearTimeout(timer);
  }, [decision]);
  async function decide(approve: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await request('/device/decision', {
        method: 'POST',
        body: JSON.stringify({ userCode: code, approve, projectIds: selected }),
      });
      setDecision(approve ? 'approved' : 'denied');
      setDevice(undefined);
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
    <Container
      id={embedded ? 'agent-authorizations' : undefined}
      className={
        embedded
          ? 'account-agent-authorizations'
          : `account-settings-shell agent-access-shell ${code ? 'agent-authorization' : ''}`
      }
    >
      <div className="agent-access-content">
        {embedded ? (
          <h2>Agent 授权</h2>
        ) : (
          <>
            <a className="account-settings-back" href="/account">
              返回设置
            </a>
            <header className="agent-access-heading">
              <span>MARKFIX · CONNECT</span>
              <h1>连接你的开发工具</h1>
              <p>选择本次允许访问的项目，授权后继续原来的任务。</p>
            </header>
          </>
        )}
        {account && <p>当前账号：{account}</p>}
        {loading && <p>正在读取授权信息…</p>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {decision && (
          <Card className="agent-access-card agent-access-result" role="status">
            <span className="agent-result-symbol">{decision === 'approved' ? '✓' : '—'}</span>
            <h2>{decision === 'approved' ? '授权完成' : '已拒绝授权'}</h2>
            <p>
              {decision === 'approved'
                ? 'CLI 将自动接收授权并继续执行，使用 Skill 的会话也会随之继续。'
                : '本次请求已结束，开发工具不会获得项目访问权限。'}
            </p>
            <p>此页面将自动关闭。若浏览器阻止关闭，可手动关闭此标签页，回到原来的页面或会话。</p>
            <Button onClick={() => window.close()}>关闭授权页</Button>
          </Card>
        )}
        {device && !decision && (
          <Card className="agent-access-card">
            <h2>授权 {device.agentType} 访问 MarkFix</h2>
            <p className="agent-device-details">
              设备：{device.deviceName} · 核对终端授权码：
              <strong className="agent-user-code">{code}</strong>
            </p>
            <p>
              设备名称由申请方填写，请先与修复人员核对申请码。授权有效期最长 30
              天，可随时撤销。允许上报仓库名称，读取所选项目的标注与截图，领取问题并回写修复结果。访问仍受你的项目角色限制。
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
                  <Button
                    disabled={busy || !selected.length || new Date(device.expiresAt) <= new Date()}
                    onClick={() => void decide(true)}
                  >
                    {busy
                      ? '正在处理…'
                      : selected.length
                        ? `授权 ${selected.length} 个项目`
                        : '请选择项目'}
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
        {!code && (
          <>
            {requests.map((item) => (
              <Card key={item.userCode} className="agent-access-card">
                <strong>待处理：{item.deviceName}</strong>
                <p>申请码：{item.userCode}</p>
                <a href={`/agent/authorize?code=${item.userCode}`}>核对并处理申请</a>
              </Card>
            ))}
            {!loading && !grants.length && (
              <p>
                暂无设备授权。修复人员输入你的账号邮箱后，申请会出现在这里及桌面设置的“修复授权”中。
              </p>
            )}
            {grants.map((grant) => (
              <Card key={grant.id} className="agent-access-card">
                <strong>{grant.deviceName}</strong>
                <p>
                  {grant.agentType} · {grant.projectIds.length} 个项目 ·{' '}
                  {grant.revokedAt
                    ? '已取消'
                    : new Date(grant.expiresAt) <= new Date()
                      ? '已过期'
                      : '已授权'}
                </p>
                <p>
                  授权项目：
                  {grant.projectIds
                    .map((id) => projects.find((project) => project.id === id)?.name ?? id)
                    .join('、')}
                </p>
                <p>到期时间：{new Date(grant.expiresAt).toLocaleString()}</p>
                <p>最近使用：{new Date(grant.lastUsedAt).toLocaleString()}</p>
                {!grant.revokedAt && (
                  <Button variant="outline" disabled={busy} onClick={() => void revoke(grant.id)}>
                    取消授权
                  </Button>
                )}
              </Card>
            ))}
          </>
        )}
      </div>
    </Container>
  );
}
