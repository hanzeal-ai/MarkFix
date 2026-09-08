import { useState } from 'react';
import { Button } from '@markfix/ui';
import { Settings2, Sparkles } from '@markfix/ui/icons';
import type { ProjectStorageMode } from '@markfix/contracts';
import { SubscriptionSettings } from './SubscriptionWindow';
import {
  desktopPreferenceKeys,
  newAnnotationStorageModePreference,
  startupViewPreference,
  type StartupView,
} from './desktop-preferences';

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
  const [startupView, setStartupView] = useState<StartupView>(() =>
    startupViewPreference(window.localStorage),
  );
  const [newAnnotationStorageMode, setNewAnnotationStorageMode] = useState<ProjectStorageMode>(() =>
    newAnnotationStorageModePreference(window.localStorage),
  );

  return (
    <main className="settings-window">
      <div className="settings-window-body">
        <nav className="settings-sidebar" aria-label="设置项目">
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
              <h2>启动与新标注</h2>
              <div className="settings-option-list">
                <div className="settings-option-row">
                  <span id="startup-view-label">启动时打开</span>
                  <div
                    className="settings-radio-group"
                    role="radiogroup"
                    aria-labelledby="startup-view-label"
                  >
                    {(
                      [
                        ['new', '新标注页面'],
                        ['last-project', '上次项目'],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="startup-view"
                          value={value}
                          checked={startupView === value}
                          onChange={() => {
                            setStartupView(value);
                            window.localStorage.setItem(desktopPreferenceKeys.startupView, value);
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="settings-option-row">
                  <span id="new-annotation-storage-mode-label">新标注默认模式</span>
                  <div
                    className="settings-radio-group"
                    role="radiogroup"
                    aria-labelledby="new-annotation-storage-mode-label"
                  >
                    {(
                      [
                        ['CLOUD', '云端协作'],
                        ['LOCAL', '仅本机'],
                      ] as const satisfies readonly (readonly [ProjectStorageMode, string])[]
                    ).map(([value, label]) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="new-annotation-storage-mode"
                          value={value}
                          checked={newAnnotationStorageMode === value}
                          onChange={() => {
                            setNewAnnotationStorageMode(value);
                            window.localStorage.setItem(
                              desktopPreferenceKeys.newAnnotationStorageMode,
                              value,
                            );
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
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
