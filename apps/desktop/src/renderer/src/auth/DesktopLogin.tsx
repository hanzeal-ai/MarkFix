import type { AccountPage } from '../../../account-pages';
import { useState, type FormEvent } from 'react';
import { AuthLayout, toast, Button, Card, Input, Label, PasswordInput } from '@markfix/ui';
import type { DesktopUser } from '../annotation-workspace/model';
import { defaultDesktopPassword } from './login-defaults';

export function DesktopLogin({
  onAuthenticated,
  onLocal,
}: {
  onAuthenticated: (user: DesktopUser) => void;
  onLocal: () => void;
}) {
  const [email, setEmail] = useState(import.meta.env.DEV ? 'admin@markfix.local' : '');
  const [password, setPassword] = useState(() => defaultDesktopPassword(import.meta.env.DEV));
  const [busy, setBusy] = useState(false);

  const openAccountPage = async (page: AccountPage) => {
    try {
      await window.markfix.openAccountPage(page);
      if (page === 'register' || page === 'forgot-password')
        toast.info('请在浏览器中完成操作，然后返回桌面端登录。');
    } catch {
      toast.error('无法打开账户页面，请检查网络或稍后重试。');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      onAuthenticated(await window.markfix.login(email, password));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      toast.error(
        /fetch failed|ECONNREFUSED/i.test(message)
          ? '无法连接 MarkFix 服务，请检查网络连接和服务状态。'
          : message || '登录失败，请检查账号和密码。',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout className="desktop-auth">
      <Card>
        <p className="eyebrow">DESKTOP WORKSPACE</p>
        <h1>登录 MarkFix</h1>
        <p className="desktop-auth-description">欢迎回来，从网页上的一处标记开始。</p>
        <form onSubmit={(event) => void submit(event)}>
          <Label>
            邮箱
            <Input
              type="email"
              autoComplete="username"
              placeholder="请输入邮箱"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Label>
          <Label>
            密码
            <PasswordInput
              wrapperClassName="password-field"
              autoComplete="current-password"
              placeholder="请输入密码"
              toggleClassName="password-toggle"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Label>
          <Button type="submit" disabled={busy}>
            {busy ? '正在登录…' : '登录'}
          </Button>
        </form>
        <Button variant="outline" onClick={onLocal}>
          仅在本机使用
        </Button>
        <div className="desktop-auth-links">
          <button type="button" onClick={() => void openAccountPage('forgot-password')}>
            忘记密码
          </button>
          <span>
            还没有账户？
            <button type="button" onClick={() => void openAccountPage('register')}>
              立即注册
            </button>
          </span>
        </div>
      </Card>
      <footer className="desktop-auth-legal">
        <span>Mark It! Fix It!</span>
        <button type="button" onClick={() => void openAccountPage('privacy')}>
          隐私政策
        </button>
        <button type="button" onClick={() => void openAccountPage('terms')}>
          服务条款
        </button>
      </footer>
    </AuthLayout>
  );
}
