import type { AccountPage } from '../../../account-pages';
import { useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Input,
  Label,
  MarkFixLogo,
  PasswordInput,
  toast,
} from '@markfix/ui';
import type { DesktopUser } from '../annotation-workspace/model';
import { defaultDesktopPassword } from './login-defaults';

type AuthMode = 'login' | 'register';

export function DesktopLogin({
  onAuthenticated,
  onLocal,
}: {
  onAuthenticated: (user: DesktopUser) => void;
  onLocal: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(import.meta.env.DEV ? 'admin@markfix.local' : '');
  const [password, setPassword] = useState(() => defaultDesktopPassword(import.meta.env.DEV));
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const requestVersion = useRef(0);

  const openAccountPage = async (page: AccountPage) => {
    try {
      await window.markfix.openAccountPage(page);
      if (page === 'forgot-password') toast.info('请在浏览器中完成密码重置，然后返回桌面端登录。');
    } catch {
      toast.error('无法打开账户页面，请检查网络或稍后重试。');
    }
  };

  const switchMode = (next: AuthMode) => {
    requestVersion.current += 1;
    setMode(next);
    setPassword('');
    setConfirmation('');
    setError('');
    setMessage('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const version = ++requestVersion.current;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'register') {
        if (password !== confirmation) throw new Error('两次输入的密码不一致。');
        const result = await window.markfix.register(displayName, email, password);
        if (requestVersion.current !== version) return;
        if (result.authenticated) {
          onAuthenticated(result.user);
          return;
        }
        setPassword('');
        setConfirmation('');
        setMessage(`账户已创建，验证邮件已发送至 ${result.email}。完成验证后即可登录。`);
        return;
      }
      const user = await window.markfix.login(email, password);
      if (requestVersion.current === version) onAuthenticated(user);
    } catch (cause) {
      if (requestVersion.current !== version) return;
      const detail = cause instanceof Error ? cause.message : '';
      setError(
        /fetch failed|ECONNREFUSED/i.test(detail)
          ? '无法连接 MarkFix 服务，请检查网络连接和服务状态。'
          : detail || (mode === 'register' ? '注册失败，请检查填写内容。' : '登录失败。'),
      );
    } finally {
      if (requestVersion.current === version) setBusy(false);
    }
  };

  return (
    <main className="desktop-auth">
      <header className="desktop-auth-brand">
        <MarkFixLogo width={112} height={32} />
      </header>
      <section className="desktop-auth-stage">
        <Card className="desktop-auth-card">
          {message ? (
            <div className="desktop-auth-result" role="status">
              <p>{message}</p>
              <Button type="button" onClick={() => switchMode('login')}>
                返回登录
              </Button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              {mode === 'register' && (
                <Label>
                  姓名
                  <Input
                    autoComplete="name"
                    maxLength={120}
                    placeholder="你的姓名"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    required
                  />
                </Label>
              )}
              <Label>
                邮箱
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Label>
              <Label>
                密码
                <PasswordInput
                  wrapperClassName="password-field"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? 10 : undefined}
                  maxLength={200}
                  placeholder={mode === 'register' ? '至少 10 个字符' : '请输入密码'}
                  toggleClassName="password-toggle"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Label>
              {mode === 'register' && (
                <Label>
                  确认密码
                  <PasswordInput
                    wrapperClassName="password-field"
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={200}
                    placeholder="再次输入密码"
                    toggleClassName="password-toggle"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                  />
                </Label>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? '正在处理…' : mode === 'login' ? '登录' : '创建账户'}
              </Button>
              <p className="desktop-auth-switch">
                {mode === 'login' ? '没有账号？' : '已有账号？'}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                >
                  {mode === 'login' ? '点击创建' : '点击登录'}
                </button>
              </p>
            </form>
          )}
          {mode === 'login' && !message && (
            <button
              className="desktop-auth-recovery"
              type="button"
              onClick={() => void openAccountPage('forgot-password')}
            >
              忘记密码
            </button>
          )}
          {mode === 'register' && !message && (
            <p className="desktop-auth-consent">
              创建账户即表示你同意
              <button type="button" onClick={() => void openAccountPage('terms')}>
                服务条款
              </button>
              和
              <button type="button" onClick={() => void openAccountPage('privacy')}>
                隐私政策
              </button>
              。
            </p>
          )}
        </Card>
      </section>
      <button
        className="desktop-auth-local"
        type="button"
        disabled={busy}
        onClick={() => {
          requestVersion.current += 1;
          onLocal();
        }}
      >
        仅在本机使用
      </button>
      <footer className="desktop-auth-legal">
        <button type="button" onClick={() => void openAccountPage('privacy')}>
          隐私政策
        </button>
        <button type="button" onClick={() => void openAccountPage('terms')}>
          服务条款
        </button>
      </footer>
    </main>
  );
}
