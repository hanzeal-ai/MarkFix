import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from '@markfix/ui/icons';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Input,
  Label,
  AuthLayout,
  PasswordInput,
} from '@markfix/ui';
import { MarkFixApi } from '@markfix/api-client';
import './account-access.css';

const api = new MarkFixApi(import.meta.env.VITE_API_URL ?? 'http://localhost:4310');

type AccountMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'invite';

const modeForPath = (pathname: string): AccountMode => {
  if (pathname === '/register') return 'register';
  if (pathname === '/verify-email') return 'verify';
  if (pathname === '/forgot-password') return 'forgot';
  if (pathname === '/reset-password') return 'reset';
  if (pathname === '/accept-invitation') return 'invite';
  return 'login';
};

const content: Record<AccountMode, { eyebrow: string; title: string }> = {
  login: { eyebrow: 'Management workspace', title: '登录管理后台' },
  register: { eyebrow: 'Create workspace', title: '创建 MarkFix 账户' },
  verify: { eyebrow: 'Email verification', title: '验证邮箱' },
  forgot: { eyebrow: 'Account recovery', title: '找回密码' },
  reset: { eyebrow: 'Account recovery', title: '设置新密码' },
  invite: { eyebrow: 'Team invitation', title: '加入工作区' },
};

export function AccountAccess() {
  const mode = modeForPath(window.location.pathname);
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') ?? '', []);
  const nextPath = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('next');
    return value?.startsWith('/') && !value.startsWith('//') ? value : '/app';
  }, []);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(mode === 'verify' && Boolean(token));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (mode !== 'verify' || !token) return;
    void api
      .verifyEmail(token)
      .then(() => setMessage('邮箱验证完成，现在可以登录。'))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '邮箱验证失败。'),
      )
      .finally(() => setBusy(false));
  }, [mode, token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'login') {
        await api.login(email, password);
        window.location.replace(nextPath);
        return;
      }
      if (mode === 'register') {
        const result = await api.register({
          email,
          password,
          displayName,
          ...(workspaceName.trim() ? { workspaceName } : {}),
        });
        if (result.verificationToken) {
          await api.verifyEmail(result.verificationToken);
          await api.login(email, password);
          window.location.replace(nextPath);
          return;
        }
        setMessage('账户已创建，请通过邮件完成邮箱验证后登录。');
        return;
      }
      if (mode === 'forgot') {
        const result = await api.forgotPassword(email);
        if (result.resetToken) {
          window.location.assign(`/reset-password?token=${encodeURIComponent(result.resetToken)}`);
          return;
        }
        setMessage('如果该邮箱已注册，密码重置邮件将很快送达。');
        return;
      }
      if (mode === 'reset') {
        if (!token) throw new Error('密码重置链接缺少有效令牌。');
        if (password !== confirmation) throw new Error('两次输入的密码不一致。');
        await api.resetPassword(token, password);
        setMessage('密码已更新，请使用新密码登录。');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '请求失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const acceptInvitation = async () => {
    setBusy(true);
    setError('');
    try {
      if (!token) throw new Error('邀请链接缺少有效令牌。');
      await api.acceptInvitation(token, '');
      window.location.replace('/app');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '接受邀请失败。');
    } finally {
      setBusy(false);
    }
  };

  const actionLabel =
    mode === 'register'
      ? '创建账户'
      : mode === 'forgot'
        ? '发送重置邮件'
        : mode === 'reset'
          ? '更新密码'
          : '进入管理后台';

  return (
    <AuthLayout className="account-shell">
      <Card className="account-card">
        <header>
          <span>{content[mode].eyebrow}</span>
          <h1>{content[mode].title}</h1>
          <p>
            {mode === 'login'
              ? '欢迎回来，继续推进团队的每一处改进。'
              : mode === 'forgot'
                ? '输入注册邮箱，我们将向你发送密码重置链接。'
                : '一个账户，连接桌面标注与团队工作区。'}
          </p>
        </header>

        {message ? (
          <div className="account-result">
            <CheckCircle2 />
            <p>{message}</p>
            <Button onClick={() => window.location.assign('/login')}>返回登录</Button>
          </div>
        ) : mode === 'verify' ? (
          <div className="account-result">
            <p>{busy ? '正在验证邮箱…' : token ? '验证未完成。' : '验证链接缺少令牌。'}</p>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button variant="outline" onClick={() => window.location.assign('/login')}>
              返回登录
            </Button>
          </div>
        ) : mode === 'invite' ? (
          <div className="account-result">
            <p>登录或注册后，即可接受邀请并加入团队工作区。</p>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button disabled={busy || !token} onClick={() => void acceptInvitation()}>
              {busy ? '正在加入…' : '接受邀请'}
            </Button>
            <div className="account-invite-links">
              <a
                href={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              >
                登录
              </a>
              <a
                href={`/register?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              >
                注册新账户
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            {mode === 'register' && (
              <>
                <Label>
                  姓名
                  <Input
                    autoComplete="name"
                    maxLength={120}
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </Label>
                <Label>
                  工作区名称
                  <Input
                    maxLength={120}
                    placeholder="选填"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                  />
                </Label>
              </>
            )}
            {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
              <Label>
                邮箱
                <Input
                  autoComplete="email"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Label>
            )}
            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <Label>
                {mode === 'reset' ? '新密码' : '密码'}
                <PasswordInput
                  wrapperClassName="account-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={10}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </Label>
            )}
            {mode === 'reset' && (
              <Label>
                确认新密码
                <PasswordInput
                  wrapperClassName="account-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  minLength={10}
                  required
                  autoComplete="new-password"
                />
              </Label>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button size="lg" type="submit" disabled={busy}>
              {busy ? '正在处理…' : actionLabel} {!busy && <ArrowRight />}
            </Button>
          </form>
        )}

        {!message && mode === 'login' && (
          <footer>
            <a href="/forgot-password">忘记密码</a>
            <span>
              还没有账户？
              <a
                href={`/register${nextPath === '/app' ? '' : `?next=${encodeURIComponent(nextPath)}`}`}
              >
                立即注册
              </a>
            </span>
          </footer>
        )}
        {!message && mode === 'register' && (
          <footer>
            <span>
              已有账户？
              <a
                href={`/login${nextPath === '/app' ? '' : `?next=${encodeURIComponent(nextPath)}`}`}
              >
                返回登录
              </a>
            </span>
          </footer>
        )}
        {!message && (mode === 'forgot' || mode === 'reset') && (
          <footer>
            <a href="/login">返回登录</a>
          </footer>
        )}
        {mode === 'register' ? (
          <p className="account-consent">
            创建账户即表示你同意 <a href="/terms">服务条款</a> 和 <a href="/privacy">隐私政策</a>。
          </p>
        ) : null}
      </Card>
      <div className="account-legal-footer">
        <small>Mark It! Fix It!</small>
        <a href="/privacy">隐私</a>
        <a href="/terms">条款</a>
      </div>
    </AuthLayout>
  );
}
