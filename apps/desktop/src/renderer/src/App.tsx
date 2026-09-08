import { useEffect, useState } from 'react';
import { AuthLayout, Card } from '@markfix/ui';
import type { ClientPolicy } from '@markfix/contracts';
import { DesktopUpdateButton } from './DesktopUpdateButton';
import { DesktopLogin } from './auth/DesktopLogin';
import { AnnotationWorkspace } from './annotation-workspace/AnnotationWorkspace';
import type { DesktopUser } from './annotation-workspace/model';

export function App() {
  const [policy, setPolicy] = useState<ClientPolicy>();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: DesktopUser }
  >({ status: 'loading' });

  useEffect(() => {
    void window.markfix.authStatus().then((result) => {
      setPolicy(result.policy);
      setState(
        result.authenticated && result.user
          ? { status: 'authenticated', user: result.user }
          : { status: 'anonymous' },
      );
    });
  }, []);

  if (policy?.status === 'upgrade-required') {
    return (
      <AuthLayout className="desktop-auth">
        <Card>
          <p className="eyebrow">需要更新</p>
          <h1>请更新 MarkFix 后继续使用</h1>
          <p>点击更新将自动下载、安装并重启至推荐版本 {policy.recommendedVersion}。</p>
          <DesktopUpdateButton available />
        </Card>
      </AuthLayout>
    );
  }

  if (state.status === 'loading') return <main className="loading">正在恢复登录状态…</main>;
  if (state.status === 'anonymous') {
    return <DesktopLogin onAuthenticated={(user) => setState({ status: 'authenticated', user })} />;
  }
  return (
    <AnnotationWorkspace
      policy={policy}
      user={state.user}
      onLoggedOut={async () => {
        if (await window.markfix.logout()) setState({ status: 'anonymous' });
      }}
    />
  );
}
