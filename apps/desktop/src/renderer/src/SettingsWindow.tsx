import { useState } from 'react';
import { Button } from '@markfix/ui';
import { Settings2, Sparkles } from '@markfix/ui/icons';
import { SubscriptionSettings } from './SubscriptionWindow';

type SettingsSection = 'general' | 'subscription';

const shortcuts = [
  ['新建标注', '⌘N'],
  ['显示或隐藏侧边栏', '⌘B'],
  ['聚焦地址栏', '⌘L'],
  ['元素批注', '⌥W'],
  ['截图批注', '⌥A'],
  ['打开设置', '⌘,'],
] as const;

export function SettingsWindow(): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>('general');

  return (
    <main className="settings-window">
      <header className="settings-window-titlebar">
        <span className="subscription-logo">M</span>
        <strong>MarkFix</strong>
        <i>设置</i>
      </header>
      <div className="settings-window-body">
        <nav className="settings-sidebar" aria-label="设置项目">
          <p>设置</p>
          <Button
            type="button"
            variant="ghost"
            className={section === 'general' ? 'active' : ''}
            aria-current={section === 'general' ? 'page' : undefined}
            onClick={() => setSection('general')}
          >
            <Settings2 />
            <span>通用</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={section === 'subscription' ? 'active' : ''}
            aria-current={section === 'subscription' ? 'page' : undefined}
            onClick={() => setSection('subscription')}
          >
            <Sparkles />
            <span>订阅</span>
          </Button>
        </nav>
        <section className="settings-window-content">
          {section === 'general' ? (
            <div className="settings-general" aria-label="通用设置">
              <header>
                <p>桌面端</p>
                <h1>通用</h1>
              </header>
              <h2>快捷操作</h2>
              <div className="settings-shortcut-list">
                {shortcuts.map(([label, shortcut]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <kbd>{shortcut}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <SubscriptionSettings />
          )}
        </section>
      </div>
    </main>
  );
}
