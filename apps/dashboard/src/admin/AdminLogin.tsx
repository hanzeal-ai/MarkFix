import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from '@markfix/ui/icons';
import { Button, Card, Input, Label } from '@markfix/ui';
import { MarkFixApi } from '@markfix/api-client';
import './admin-login.css';

const api = new MarkFixApi(import.meta.env.VITE_API_URL ?? 'http://localhost:4310');

export function AdminLogin() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(identifier, password);
      window.location.replace('/app');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败，请检查账号和密码。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-login-shell">
      <a className="admin-login-back" href="/">
        <ArrowLeft /> 返回官网
      </a>
      <Card className="admin-login-card">
        <a className="admin-login-brand" href="/" aria-label="MarkFix 首页">
          <span>M</span>
          MarkFix
        </a>
        <div className="admin-login-heading">
          <span>Management workspace</span>
          <h1>登录管理后台</h1>
          <p>管理项目、标注与团队处理进度。</p>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <Label>
            账号或邮箱
            <Input
              autoComplete="username"
              autoFocus
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </Label>
          <Label>
            密码
            <span className="admin-login-password">
              <Input
                autoComplete="current-password"
                minLength={8}
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </span>
          </Label>
          {error ? <p className="admin-login-error">{error}</p> : null}
          <Button size="lg" type="submit" disabled={busy}>
            {busy ? '正在登录…' : '进入管理后台'} {!busy ? <ArrowRight /> : null}
          </Button>
        </form>
      </Card>
      <small>Mark It! Fix It!</small>
    </main>
  );
}
