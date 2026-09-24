import { primaryKey, altKey } from './platform';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  toast,
  Kbd,
  KbdGroup,
  Label,
  PasswordInput,
  RadioGroup,
  RadioGroupItem,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@markfix/ui';
import { Settings2, Sparkles, UserRound } from '@markfix/ui/icons';
import type { ProjectStorageMode } from '@markfix/contracts';
import { SubscriptionSettings } from './SubscriptionWindow';
import {
  desktopPreferenceKeys,
  elementCommentScreenshotPreference,
  newAnnotationStorageModePreference,
  startupViewPreference,
  type StartupView,
} from './desktop-preferences';

const shortcuts = [
  ['新建标注', `${primaryKey}N`],
  ['显示或隐藏侧边栏', `${primaryKey}B`],
  ['聚焦地址栏', `${primaryKey}L`],
  ['元素批注', `${altKey}W`],
  ['截图批注', `${altKey}A`],
  ['打开设置', `${primaryKey},`],
] as const;

function AccountSettings(): React.JSX.Element {
  const [accountState, setAccountState] = useState<
    'loading' | 'authenticated' | 'anonymous' | 'error'
  >('loading');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadAccountState = () => {
    setAccountState('loading');
    void window.markfix
      .authStatus()
      .then((status) => setAccountState(status.authenticated ? 'authenticated' : 'anonymous'))
      .catch(() => setAccountState('error'));
  };

  useEffect(() => {
    loadAccountState();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) {
      setError('两次输入的新密码不一致。');
      return;
    }
    setBusy(true);
    try {
      await window.markfix.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      toast.success('密码已更新，其他设备上的登录已退出。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '修改密码失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  if (accountState === 'loading') return <p className="settings-account-state">正在读取账户…</p>;
  if (accountState === 'error')
    return (
      <div className="settings-account-empty" role="alert">
        <h2>无法读取账户</h2>
        <p>请检查服务连接后重试。</p>
        <Button variant="outline" onClick={loadAccountState}>
          重新读取
        </Button>
      </div>
    );
  if (accountState === 'anonymous')
    return (
      <div className="settings-account-empty">
        <h2>账户安全</h2>
        <p>当前为仅本机模式。登录云端账户后可在这里修改密码。</p>
      </div>
    );

  return (
    <div className="settings-account">
      <h2>修改密码</h2>
      <p>更新当前账户密码。完成后，其他设备上的登录将退出。</p>
      <form onSubmit={(event) => void submit(event)}>
        <Label>
          当前密码
          <PasswordInput
            wrapperClassName="settings-password-field"
            autoComplete="current-password"
            maxLength={200}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </Label>
        <Label>
          新密码
          <PasswordInput
            wrapperClassName="settings-password-field"
            autoComplete="new-password"
            minLength={10}
            maxLength={200}
            placeholder="至少 10 个字符"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </Label>
        <Label>
          确认新密码
          <PasswordInput
            wrapperClassName="settings-password-field"
            autoComplete="new-password"
            minLength={10}
            maxLength={200}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </Label>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? '正在更新…' : '更新密码'}
        </Button>
      </form>
    </div>
  );
}

export function SettingsWindow(): React.JSX.Element {
  const [elementCommentScreenshot, setElementCommentScreenshot] = useState(() =>
    elementCommentScreenshotPreference(window.localStorage),
  );
  const [startupView, setStartupView] = useState<StartupView>(() =>
    startupViewPreference(window.localStorage),
  );
  const [newAnnotationStorageMode, setNewAnnotationStorageMode] = useState<ProjectStorageMode>(() =>
    newAnnotationStorageModePreference(window.localStorage),
  );

  return (
    <main className="settings-window">
      <Tabs defaultValue="general" orientation="vertical" className="settings-window-body">
        <TabsList className="settings-sidebar" aria-label="设置项目">
          <TabsTrigger value="general">
            <Settings2 />
            <span>通用</span>
          </TabsTrigger>
          <TabsTrigger value="subscription">
            <Sparkles />
            <span>订阅</span>
          </TabsTrigger>
          <TabsTrigger value="account">
            <UserRound />
            <span>账户</span>
          </TabsTrigger>
        </TabsList>
        <section className="settings-window-content">
          <TabsContent value="general" className="settings-general" aria-label="通用设置">
            <h2>启动与新标注</h2>
            <div className="settings-option-list">
              <div className="settings-option-row">
                <span id="startup-view-label">启动时打开</span>
                <RadioGroup
                  className="settings-radio-group"
                  value={startupView}
                  onValueChange={(value) => {
                    if (value === 'new' || value === 'last-project') {
                      setStartupView(value);
                      window.localStorage.setItem(desktopPreferenceKeys.startupView, value);
                    }
                  }}
                  aria-labelledby="startup-view-label"
                >
                  {(
                    [
                      ['new', '新标注页面'],
                      ['last-project', '上次项目'],
                    ] as const
                  ).map(([value, label]) => (
                    <Label key={value}>
                      <RadioGroupItem value={value} data-value={value} aria-label={label} />
                      <span>{label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
              <div className="settings-option-row">
                <span id="new-annotation-storage-mode-label">新标注默认模式</span>
                <RadioGroup
                  className="settings-radio-group"
                  value={newAnnotationStorageMode}
                  onValueChange={(value) => {
                    if (value === 'LOCAL' || value === 'CLOUD') {
                      setNewAnnotationStorageMode(value);
                      window.localStorage.setItem(
                        desktopPreferenceKeys.newAnnotationStorageMode,
                        value,
                      );
                    }
                  }}
                  aria-labelledby="new-annotation-storage-mode-label"
                >
                  {(
                    [
                      ['CLOUD', '云端协作'],
                      ['LOCAL', '仅本机'],
                    ] as const satisfies readonly (readonly [ProjectStorageMode, string])[]
                  ).map(([value, label]) => (
                    <Label key={value}>
                      <RadioGroupItem value={value} data-value={value} aria-label={label} />
                      <span>{label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </div>
            <h2>文字标注</h2>
            <div className="settings-option-list">
              <div className="settings-option-row">
                <Label htmlFor="element-comment-screenshot">文字标注保存截图</Label>
                <Checkbox
                  id="element-comment-screenshot"
                  checked={elementCommentScreenshot}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true;
                    setElementCommentScreenshot(enabled);
                    window.localStorage.setItem(
                      desktopPreferenceKeys.elementCommentScreenshot,
                      String(enabled),
                    );
                  }}
                />
              </div>
            </div>
            <h2>快捷操作</h2>
            <div className="settings-shortcut-list">
              {shortcuts.map(([label, shortcut]) => (
                <div key={label}>
                  <span>{label}</span>
                  <KbdGroup aria-label={shortcut}>
                    {(shortcut.includes('+') ? shortcut.split('+') : Array.from(shortcut)).map(
                      (key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ),
                    )}
                  </KbdGroup>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="subscription">
            <SubscriptionSettings />
          </TabsContent>
          <TabsContent value="account" aria-label="账户设置">
            <AccountSettings />
          </TabsContent>
        </section>
      </Tabs>
    </main>
  );
}
