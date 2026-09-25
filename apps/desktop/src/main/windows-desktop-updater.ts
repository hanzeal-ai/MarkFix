import type { NsisUpdater } from 'electron-updater';
import { desktopUpdateActive, type DesktopUpdateStatus } from '../desktop-update';

type WindowsUpdater = Pick<
  NsisUpdater,
  | 'checkForUpdates'
  | 'quitAndInstall'
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'autoRunAppAfterInstall'
  | 'allowDowngrade'
  | 'disableDifferentialDownload'
> & {
  on(event: 'download-progress', listener: (info: { percent: number }) => void): unknown;
  on(
    event: 'error' | 'update-not-available' | 'update-available' | 'update-downloaded',
    listener: () => void,
  ): unknown;
};

export class WindowsDesktopUpdater {
  private status: DesktopUpdateStatus = { phase: 'idle', message: '' };
  private attempt = 0;
  constructor(
    private readonly createUpdater: () => WindowsUpdater,
    private readonly notify: (status: DesktopUpdateStatus) => void,
  ) {}

  getStatus(): DesktopUpdateStatus {
    return this.status;
  }

  start(): DesktopUpdateStatus {
    if (desktopUpdateActive(this.status)) return this.status;
    const attempt = ++this.attempt;
    const current = () => attempt === this.attempt;
    const fail = () => {
      if (current()) this.fail();
    };
    this.setStatus('checking', '正在检查更新…');
    try {
      const updater = this.createUpdater();
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = false;
      updater.autoRunAppAfterInstall = true;
      updater.allowDowngrade = false;
      // The release pipeline publishes complete installers, not blockmaps.
      updater.disableDifferentialDownload = true;
      updater.on('error', fail);
      updater.on('update-not-available', () => {
        if (current() && this.status.phase === 'checking')
          this.setStatus('current', '当前已是最新推荐版本。');
      });
      updater.on('update-available', () => {
        if (current() && this.status.phase === 'checking')
          this.setStatus('downloading', '正在下载更新，完成后将自动安装并重启…');
      });
      updater.on('download-progress', ({ percent }) => {
        if (current() && this.status.phase === 'downloading' && Number.isFinite(percent))
          this.setStatus(
            'downloading',
            `正在下载更新 ${Math.min(100, Math.max(0, Math.floor(percent)))}%…`,
          );
      });
      updater.on('update-downloaded', () => {
        if (!current() || this.status.phase !== 'downloading') return;
        this.setStatus('installing', '正在安装更新并重启…');
        try {
          updater.quitAndInstall(true, true);
        } catch {
          fail();
        }
      });
      void updater
        .checkForUpdates()
        .then((result) => result?.downloadPromise?.catch(fail))
        .catch(fail);
    } catch {
      fail();
    }
    return this.status;
  }

  private fail(): void {
    this.setStatus('error', '更新失败，当前版本仍可使用，请检查网络后重试。');
  }
  private setStatus(phase: DesktopUpdateStatus['phase'], message: string): void {
    this.status = { phase, message };
    this.notify(this.status);
  }
}
