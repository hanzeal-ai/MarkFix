import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff } from '@markfix/ui/icons';
import { Alert, AlertDescription, Button, Card, Input, Label } from '@markfix/ui';
import { MarkFixApi } from '@markfix/api-client';
import './account-access.css';

const api = new MarkFixApi(import.meta.env.VITE_API_URL ?? 'http://localhost:4310');

type AccountMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

const modeForPath = (pathname: string): AccountMode => {
  if (pathname === '/register') return 'register';
  if (pathname === '/verify-email') return 'verify';
  if (pathname === '/forgot-password') return 'forgot';
  if (pathname === '/reset-password') return 'reset';
  return 'login';
};

const content: Record<AccountMode, { eyebrow: string; title: string }> = {
  login: { eyebrow: 'Management workspace', title: '登录管理后台' },
  register: { eyebrow: 'Create workspace', title: '创建 MarkFix 账户' },
  verify: { eyebrow: 'Email verification', title: '验证邮箱' },
  forgot: { eyebrow: 'Account recovery', title: '找回密码' },
  reset: { eyebrow: 'Account recovery', title: '设置新密码' },
};

function PasswordInput({
  value,
  onChange,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="account-password">
      <Input
        autoComplete={autoComplete}
        minLength={10}
        required
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        aria-label={visible ? '隐藏密码' : '显示密码'}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </span>
  );
}

export function AccountAccess() {
  const mode = modeForPath(window.location.pathname);
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') ?? '', []);
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
        window.location.replace('/app');
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
          window.location.replace('/app');
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

  const actionLabel =
    mode === 'register'
      ? '创建账户'
      : mode === 'forgot'
        ? '发送重置邮件'
        : mode === 'reset'
          ? '更新密码'
          : '进入管理后台';

  return (
    <main className="account-shell">
      <a className="account-back" href="/">
        <ArrowLeft /> 返回官网
      </a>
      <Card className="account-card">
        <a className="account-brand" href="/" aria-label="MarkFix 首页">
          <span>M</span>
          MarkFix
        </a>
        <header>
          <span>{content[mode].eyebrow}</span>
          <h1>{content[mode].title}</h1>
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
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </Label>
            )}
            {mode === 'reset' && (
              <Label>
                确认新密码
                <PasswordInput
                  value={confirmation}
                  onChange={setConfirmation}
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
              还没有账户？<a href="/register">立即注册</a>
            </span>
          </footer>
        )}
        {!message && mode === 'register' && (
          <footer>
            <span>
              已有账户？<a href="/login">返回登录</a>
            </span>
          </footer>
        )}
      </Card>
      <small>Mark It! Fix It!</small>
    </main>
  );
}
