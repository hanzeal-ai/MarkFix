import { useEffect, useState } from 'react';
import { Card } from '@markfix/ui';
import type { ClientPolicy } from '@markfix/contracts';
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
      <main className="desktop-auth">
        <Card>
          <div className="desktop-auth-brand"><span>m</span> MarkFix</div>
          <p className="eyebrow">UPDATE REQUIRED</p>
          <h1>This version is no longer supported</h1>
          <p>
            Install MarkFix {policy.minimumVersion} or newer before signing in or submitting
            reports. Recommended version: {policy.recommendedVersion}.
          </p>
        </Card>
      </main>
    );
  }

  if (state.status === 'loading') return <main className="desktop-auth">Restoring session…</main>;
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
