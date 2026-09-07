import { useEffect, useState } from 'react';
import type { WorkspaceSubscription } from '@markfix/api-client';
import type { WorkspaceSummary } from '@markfix/contracts';
import { Badge, Button, Card, MarkFixMark, NativeSelect } from '@markfix/ui';
import { Check, LoaderCircle, Sparkles } from '@markfix/ui/icons';
import type { SubscriptionBridge } from '../../subscription.js';
import './subscription-window.css';

const subscriptionBridge = window.markfix as typeof window.markfix & SubscriptionBridge;

const limitLabel = (used: number, limit: number | null): string =>
  limit === null ? `${used} / 不限` : `${used} / ${limit}`;

const usagePercent = (used: number, limit: number | null): number =>
  limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));

export function SubscriptionSettings(): React.JSX.Element {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [subscription, setSubscription] = useState<WorkspaceSubscription>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void subscriptionBridge
      .listWorkspaces()
      .then((items) => {
        if (!active) return;
        setWorkspaces(items);
        setWorkspaceId(items[0]?.id ?? '');
        if (items.length === 0) setError('当前账号还没有工作区');
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法加载工作区');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    setSubscription(undefined);
    setError('');
    setMessage('');
    void subscriptionBridge
      .getSubscription(workspaceId)
      .then((value) => {
        if (active) setSubscription(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法加载订阅信息');
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const upgrade = async (): Promise<void> => {
    if (!workspaceId || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await subscriptionBridge.requestSubscriptionUpgrade(workspaceId);
      setSubscription(result);
      setMessage(result.plan === 'TEAM' ? '已升级为团队版' : '升级申请已提交，我们会尽快与你联系');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '升级失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const canUpgrade = workspaces.find((workspace) => workspace.id === workspaceId)?.role === 'OWNER';

  return (
    <section className="subscription-content settings-subscription" aria-label="订阅管理">
      <div className="subscription-heading">
        <div>
          <p>当前订阅</p>
          <h1>套餐与用量</h1>
        </div>
        {workspaces.length > 1 ? (
          <NativeSelect
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <span className="subscription-workspace">{workspaces[0]?.name ?? '工作区'}</span>
        )}
      </div>

      {!subscription && !error ? (
        <div className="subscription-loading">
          <LoaderCircle /> 正在加载
        </div>
      ) : null}
      {error ? <p className="subscription-error">{error}</p> : null}

      {subscription ? (
        <Card className="subscription-plan-card">
          <div className="subscription-plan-main">
            <div className="subscription-plan-name">
              <span className="subscription-plan-icon">
                <Sparkles />
              </span>
              <div>
                <div>
                  <h2>{subscription.planName}</h2>
                  <Badge variant={subscription.plan === 'TEAM' ? 'default' : 'secondary'}>
                    当前套餐
                  </Badge>
                </div>
                <p>
                  {subscription.plan === 'TEAM'
                    ? '适合持续协作的产品团队'
                    : '适合个人体验与小型项目'}
                </p>
              </div>
            </div>

            <div className="subscription-usage-grid">
              <Usage
                label="标注项目"
                used={subscription.usage.projects}
                limit={subscription.projectLimit}
              />
              <Usage
                label="工作区成员"
                used={subscription.usage.members}
                limit={subscription.memberLimit}
              />
            </div>
          </div>

          <div className="subscription-plan-actions">
            <div className="subscription-benefits">
              <span>
                <Check /> 项目与标注集中管理
              </span>
              <span>
                <Check /> 团队成员协作
              </span>
            </div>
            {subscription.plan === 'FREE' ? (
              <Button
                onClick={() => void upgrade()}
                disabled={busy || Boolean(subscription.upgradeRequestedAt) || !canUpgrade}
                title={canUpgrade ? undefined : '仅工作区所有者可升级套餐'}
              >
                {busy ? <LoaderCircle className="subscription-spin" /> : <Sparkles />}
                {subscription.upgradeRequestedAt
                  ? '升级申请已提交'
                  : canUpgrade
                    ? '升级团队版'
                    : '联系所有者升级'}
              </Button>
            ) : (
              <Button variant="outline" disabled>
                已是团队版
              </Button>
            )}
          </div>
        </Card>
      ) : null}

      {message ? <p className="subscription-message">{message}</p> : null}
    </section>
  );
}

export function SubscriptionWindow(): React.JSX.Element {
  return (
    <main className="subscription-window">
      <header className="subscription-titlebar">
        <MarkFixMark className="subscription-logo" size={25} />
        <strong>MarkFix</strong>
        <span>订阅</span>
      </header>
      <SubscriptionSettings />
    </main>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return (
    <div className="subscription-usage">
      <div>
        <span>{label}</span>
        <strong>{limitLabel(used, limit)}</strong>
      </div>
      {limit === null ? (
        <div className="subscription-unlimited">团队版不限量</div>
      ) : (
        <div className="subscription-progress" aria-label={`${label}用量`}>
          <span style={{ width: `${usagePercent(used, limit)}%` }} />
        </div>
      )}
    </div>
  );
}
