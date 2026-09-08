import type { AutoUpdater } from 'electron';
import { desktopUpdateActive, type DesktopUpdateStatus } from '../desktop-update.js';

export class DesktopUpdater {
  private status: DesktopUpdateStatus = { phase: 'idle', message: '' };

  constructor(
    private readonly updater: Pick<
      AutoUpdater,
      'on' | 'setFeedURL' | 'checkForUpdates' | 'quitAndInstall'
    >,
    private readonly feedUrl: () => string,
    private readonly notify: (status: DesktopUpdateStatus) => void,
  ) {
    updater.on('error', () => this.setStatus('error', '更新失败，当前版本仍可使用，请稍后重试。'));
    updater.on('update-available', () => {
      if (this.status.phase === 'checking')
        this.setStatus('downloading', '正在下载更新，完成后将自动安装并重启…');
    });
    updater.on('update-not-available', () => {
      if (this.status.phase === 'checking') this.setStatus('current', '当前已是最新推荐版本。');
    });
    updater.on('update-downloaded', () => {
      if (this.status.phase !== 'downloading') return;
      this.setStatus('installing', '正在安装更新并重启…');
      try {
        updater.quitAndInstall();
      } catch {
        this.setStatus('error', '自动安装失败，当前版本仍可使用，请稍后重试。');
      }
    });
  }

  getStatus(): DesktopUpdateStatus {
    return this.status;
  }

  start(): DesktopUpdateStatus {
    if (desktopUpdateActive(this.status)) return this.status;
    try {
      const url = this.feedUrl();
      this.setStatus('checking', '正在检查更新…');
      this.updater.setFeedURL({ url, serverType: 'default' });
      this.updater.checkForUpdates();
    } catch (error) {
      this.setStatus('error', error instanceof Error ? error.message : '无法启动自动更新。');
    }
    return this.status;
  }

  private setStatus(phase: DesktopUpdateStatus['phase'], message: string): void {
    this.status = { phase, message };
    this.notify(this.status);
  }
}
