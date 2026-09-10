import { useState } from 'react';
import {
  Button,
  toast,
  Kbd,
  KbdGroup,
  Label,
  RadioGroup,
  RadioGroupItem,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@markfix/ui';
import { Settings2, Sparkles } from '@markfix/ui/icons';
import type { ProjectStorageMode } from '@markfix/contracts';
import { SubscriptionSettings } from './SubscriptionWindow';
import {
  desktopPreferenceKeys,
  newAnnotationStorageModePreference,
  startupViewPreference,
  type StartupView,
} from './desktop-preferences';

const shortcuts = [
  ['新建标注', '⌘N'],
  ['显示或隐藏侧边栏', '⌘B'],
  ['聚焦地址栏', '⌘L'],
  ['元素批注', '⌥W'],
  ['截图批注', '⌥A'],
  ['打开设置', '⌘,'],
] as const;

export function SettingsWindow(): React.JSX.Element {
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
        </TabsList>
        <section className="settings-window-content">
          <TabsContent value="general" className="settings-general" aria-label="通用设置">
            <h2>本机 CLI</h2>
            <p>管理已授权设备，随时撤销对本机项目的访问。</p>
            <Button
              variant="outline"
              onClick={() =>
                void window.markfix
                  .openLocalAgentSettings()
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : '无法打开设备管理'),
                  )
              }
            >
              管理本机授权
            </Button>
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
            <h2>快捷操作</h2>
            <div className="settings-shortcut-list">
              {shortcuts.map(([label, shortcut]) => (
                <div key={label}>
                  <span>{label}</span>
                  <KbdGroup aria-label={shortcut}>
                    {Array.from(shortcut).map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </KbdGroup>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="subscription">
            <SubscriptionSettings />
          </TabsContent>
        </section>
      </Tabs>
    </main>
  );
}
