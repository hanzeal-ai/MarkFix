import { AgentRequestNotification } from './AgentAuthorizations';
import { manualUpdates } from './platform';
import { useEffect, useRef, useState } from 'react';
import { AuthLayout, Card } from '@markfix/ui';
import type { ClientPolicy } from '@markfix/contracts';
import { DesktopUpdateButton } from './DesktopUpdateButton';
import { DesktopLogin } from './auth/DesktopLogin';
import { AnnotationWorkspace } from './annotation-workspace/AnnotationWorkspace';
import type { DesktopUser } from './annotation-workspace/model';

export function App() {
  const authEpoch = useRef(0);
  const [localMode, setLocalMode] = useState(false);
  const enterLocal = async () => {
    authEpoch.current++;
    await window.markfix.enterLocalMode();
    setLocalMode(true);
  };
  const [policy, setPolicy] = useState<ClientPolicy>();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: DesktopUser }
  >({ status: 'loading' });

  useEffect(() => {
    const epoch = authEpoch.current;
    void window.markfix
      .authStatus()
      .then((result) => {
        if (epoch !== authEpoch.current) return;
        setPolicy(result.policy);
        setState(
          result.authenticated && result.user
            ? { status: 'authenticated', user: result.user }
            : { status: 'anonymous' },
        );
      })
      .catch(() => {
        if (epoch === authEpoch.current) setState({ status: 'anonymous' });
      });
  }, []);

  if (!localMode && policy?.status === 'upgrade-required') {
    return (
      <AuthLayout className="desktop-auth">
        <Card>
          <p className="eyebrow">需要更新</p>
          <h1>请更新 MarkFix 后继续使用</h1>
          <p>
            {!manualUpdates
              ? '点击更新将自动下载、安装并重启至推荐版本'
              : '点击更新打开下载页，下载并覆盖安装推荐版本'}{' '}
            {policy.recommendedVersion}。
          </p>
          <DesktopUpdateButton available />
          <button onClick={() => void enterLocal()}>仅在本机使用</button>
        </Card>
      </AuthLayout>
    );
  }

  if (!localMode && state.status === 'loading')
    return (
      <main className="loading">
        <p>正在恢复登录状态…</p>
        <button onClick={() => void enterLocal()}>仅在本机使用</button>
      </main>
    );
  if (!localMode && state.status === 'anonymous') {
    return (
      <DesktopLogin
        onLocal={() => void enterLocal()}
        onAuthenticated={(user) => setState({ status: 'authenticated', user })}
      />
    );
  }
  return (
    <>
      {!localMode && state.status === 'authenticated' && (
        <AgentRequestNotification accountId={state.user.id} />
      )}
      <AnnotationWorkspace
        policy={policy}
        localMode={localMode}
        user={
          state.status === 'authenticated'
            ? state.user
            : { id: 'local', email: '', displayName: '仅本机' }
        }
        onLoggedOut={async () => {
          if (await window.markfix.logout()) {
            setLocalMode(false);
            setState({ status: 'anonymous' });
          }
        }}
      />
    </>
  );
}
