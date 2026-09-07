import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle } from '@markfix/ui/icons';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Input,
  Label,
  MarkFixMark,
  PasswordInput,
} from '@markfix/ui';
import type { DesktopUser } from '../annotation-workspace/model';
import { defaultDesktopPassword } from './login-defaults';

export function DesktopLogin({
  onAuthenticated,
}: {
  onAuthenticated: (user: DesktopUser) => void;
}) {
  const [email, setEmail] = useState('admin@markfix.local');
  const [password, setPassword] = useState(() => defaultDesktopPassword(import.meta.env.DEV));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(''), 4_000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onAuthenticated(await window.markfix.login(email, password));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(
        /fetch failed|ECONNREFUSED/i.test(message)
          ? '无法连接 MarkFix 服务，请确认本地 API 已启动。'
          : message || '登录失败，请检查账号和密码。',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="desktop-auth">
      {error && (
        <Alert className="auth-message" variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <div className="desktop-auth-brand">
          <MarkFixMark /> MarkFix
        </div>
        <p className="eyebrow">DESKTOP ANNOTATION</p>
        <h1>Sign in to start marking</h1>
        <p>Your refresh credential stays encrypted in the operating system vault.</p>
        <form onSubmit={(event) => void submit(event)}>
          <Label>
            Email
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Label>
          <Label>
            Password
            <PasswordInput
              wrapperClassName="password-field"
              toggleClassName="password-toggle"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Label>
          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
