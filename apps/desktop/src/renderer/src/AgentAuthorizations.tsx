import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription, Button, Card, Checkbox, Label, toast } from '@markfix/ui';
import type { AgentDeviceRequestSummary } from '@markfix/contracts';

type Access = Awaited<ReturnType<Window['markfix']['agentAccess']>>;

function RequestCard({
  request,
  projects,
  busy,
  decide,
}: {
  request: AgentDeviceRequestSummary;
  projects: Access['projects'];
  busy: boolean;
  decide: (code: string, approve: boolean, projects: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const expired = new Date(request.expiresAt) <= new Date();
  return (
    <Card className="settings-agent-card">
      <strong>{request.deviceName}</strong>
      <p>
        {request.agentType} · 申请码：<strong>{request.userCode}</strong>
      </p>
      <p>设备名称由申请方填写。请与修复人员核对申请码，不认识的申请请拒绝。</p>
      <p>有效期至 {new Date(request.expiresAt).toLocaleString()}</p>
      <fieldset disabled={busy || expired}>
        <legend>允许访问的项目</legend>
        {projects.map((project) => (
          <Label key={project.id}>
            <Checkbox
              checked={selected.includes(project.id)}
              onCheckedChange={(checked) =>
                setSelected((ids) =>
                  checked ? [...ids, project.id] : ids.filter((id) => id !== project.id),
                )
              }
            />
            {project.name}
          </Label>
        ))}
        {!projects.length && <p>暂无可授权项目，请先创建云端项目或接受项目邀请。</p>}
      </fieldset>
      <p>
        授权允许读取所选项目的标注与截图、登记仓库、领取任务和回写修复结果，仍受你的项目角色限制。有效期最长
        30 天，可随时撤销。
      </p>
      <div className="settings-agent-actions">
        <Button
          disabled={busy || expired || !selected.length}
          onClick={() => void decide(request.userCode, true, selected)}
        >
          授权所选项目
        </Button>
        <Button
          variant="outline"
          disabled={busy || expired}
          onClick={() => void decide(request.userCode, false, [])}
        >
          拒绝申请
        </Button>
      </div>
    </Card>
  );
}

export function AgentAuthorizations() {
  const [access, setAccess] = useState<Access>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      setAccess(await window.markfix.agentAccess());
      setError('');
    } catch (cause) {
      setAccess(undefined);
      setError(cause instanceof Error ? cause.message : '无法读取授权申请，请重试。');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await window.markfix.agentAccess();
        if (active) {
          setAccess(next);
          setError('');
        }
      } catch (cause) {
        if (active) {
          setAccess(undefined);
          setError(cause instanceof Error ? cause.message : '无法读取授权申请');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, []);
  async function decide(userCode: string, approve: boolean, projectIds: string[]) {
    setBusy(true);
    setError('');
    try {
      await window.markfix.decideAgentRequest({ userCode, approve, projectIds });
      toast.success(approve ? '已授权，修复方将自动继续。' : '已拒绝申请');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '处理失败，请刷新后重试');
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError('');
    try {
      await window.markfix.revokeAgentGrant(id);
      toast.success('授权已撤销');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '撤销失败，请重试');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-agent" aria-label="修复授权">
      <h2>修复授权</h2>
      <p>修复人员只需输入你的账号邮箱即可申请，无需你的密码。</p>
      {access && <p>当前账号：{access.account.email}</p>}
      <Button variant="outline" disabled={busy} onClick={() => void reload()}>
        刷新申请
      </Button>
      {loading && <p>正在读取授权申请…</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {access && (
        <>
          <h3>待处理申请（{access.requests.length}）</h3>
          {!access.requests.length && <p>暂无待处理申请。申请有效期为 10 分钟，页面会自动刷新。</p>}
          {access.requests.map((request) => (
            <RequestCard
              key={request.userCode}
              request={request}
              projects={access.projects}
              busy={busy}
              decide={decide}
            />
          ))}
          <h3>已授权设备</h3>
          {!access.grants.length && <p>暂无授权设备。</p>}
          {access.grants.map((grant) => (
            <Card className="settings-agent-card" key={grant.id}>
              <strong>{grant.deviceName}</strong>
              <p>
                {grant.revokedAt
                  ? '已撤销'
                  : new Date(grant.expiresAt) <= new Date()
                    ? '已过期'
                    : '已授权'}{' '}
                · {grant.agentType}
              </p>
              <p>
                项目：
                {grant.projectIds
                  .map(
                    (id) =>
                      access.projects.find((project) => project.id === id)?.name ??
                      '已不可访问的项目',
                  )
                  .join('、')}
              </p>
              <p>到期时间：{new Date(grant.expiresAt).toLocaleString()}</p>
              {!grant.revokedAt && new Date(grant.expiresAt) > new Date() && (
                <Button variant="outline" disabled={busy} onClick={() => void revoke(grant.id)}>
                  撤销授权
                </Button>
              )}
            </Card>
          ))}
        </>
      )}
    </section>
  );
}

export function AgentRequestNotification({ accountId }: { accountId: string }) {
  useEffect(() => {
    let active = true;
    const seen = new Set<string>();
    const poll = async () => {
      try {
        const requests = await window.markfix.agentRequests();
        if (!active) return;
        const fresh = requests.filter((request) => !seen.has(request.userCode));
        requests.forEach((request) => seen.add(request.userCode));
        if (fresh.length)
          toast.info(`有 ${requests.length} 条修复授权申请待处理`, {
            duration: 15000,
            description: '请在设置 → 修复授权中核对申请码并选择项目。',
            action: { label: '打开设置', onClick: () => void window.markfix.openSettings() },
          });
      } catch {
        /* The settings page provides explicit connection errors and retry. */
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 10000);
    window.addEventListener('focus', poll);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
    };
  }, [accountId]);
  return null;
}
