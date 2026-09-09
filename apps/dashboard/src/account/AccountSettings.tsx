import { useEffect, useState, type FormEvent } from 'react';
import type { AuthUser } from '@markfix/api-client';
import { MarkFixApi } from '@markfix/api-client';
import { Alert, AlertDescription, Button, Card, Checkbox, Input, Label } from '@markfix/ui';
import { ArrowLeft, Download, LoaderCircle, Trash2, UserRound } from '@markfix/ui/icons';
import './account-settings.css';

const api = new MarkFixApi(import.meta.env.VITE_API_URL ?? 'http://localhost:4310');

export function AccountSettings(): React.JSX.Element {
  const [user, setUser] = useState<AuthUser>();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'export' | 'delete'>();
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .me()
      .then(setUser)
      .catch(() => window.location.replace('/login?next=/account'));
  }, []);

  const exportData = async (): Promise<void> => {
    setBusy('export');
    setError('');
    try {
      const data = await api.exportAccountData();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `markfix-account-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '数据导出失败，请稍后重试。');
    } finally {
      setBusy(undefined);
    }
  };

  const deleteAccount = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!confirmed || !password) return;
    setBusy('delete');
    setError('');
    try {
      await api.deleteAccount(password);
      window.location.replace('/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '账户注销失败，请稍后重试。');
      setBusy(undefined);
    }
  };

  return (
    <main className="account-settings-shell">
      <nav className="account-settings-navigation" aria-label="账户导航">
        <a className="account-settings-back" href="/app">
          <ArrowLeft /> 返回管理后台
        </a>
        <a className="account-settings-back" href="/agent">
          Agent 接入与授权设备
        </a>
      </nav>
      <section className="account-settings-content">
        <header>
          <span className="account-settings-icon">
            <UserRound />
          </span>
          <div>
            <p>账户</p>
            <h1>{user?.displayName ?? '账户设置'}</h1>
            <span>{user?.email ?? '正在加载…'}</span>
          </div>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="account-settings-card">
          <div>
            <h2>导出账户数据</h2>
            <p>下载账户、项目及由你创建的标注记录。</p>
          </div>
          <Button variant="outline" onClick={() => void exportData()} disabled={Boolean(busy)}>
            {busy === 'export' ? <LoaderCircle className="account-settings-spin" /> : <Download />}
            导出 JSON
          </Button>
        </Card>

        <Card className="account-settings-card account-settings-danger">
          <div>
            <h2>注销账户</h2>
            <p>永久删除账户及仅由你使用的项目。含其他成员的项目不会被删除。</p>
          </div>
          <form onSubmit={(event) => void deleteAccount(event)}>
            <Label>
              当前密码
              <Input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Label>
            <Label className="account-settings-confirm">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(value) => setConfirmed(value === true)}
              />
              我了解注销后无法恢复
            </Label>
            <Button
              variant="destructive"
              type="submit"
              disabled={!confirmed || !password || Boolean(busy)}
            >
              {busy === 'delete' ? <LoaderCircle className="account-settings-spin" /> : <Trash2 />}
              永久注销账户
            </Button>
          </form>
        </Card>
        <footer className="account-settings-legal">
          <a href="/privacy">隐私政策</a>
          <a href="/terms">服务条款</a>
        </footer>
      </section>
    </main>
  );
}
