import type { ClientPolicy } from '@markfix/contracts';
import type { DesktopUpdateStatus } from '../desktop-update.js';

/** Trial releases are installed manually; this never quits or replaces the app. */
export class ManualDesktopUpdater {
  private status: DesktopUpdateStatus = { phase: 'idle', message: '' };

  constructor(
    private readonly loadPolicy: () => Promise<ClientPolicy>,
    private readonly openDownloadPage: () => Promise<void>,
    private readonly notify: (status: DesktopUpdateStatus) => void,
  ) {}

  getStatus(): DesktopUpdateStatus {
    return this.status;
  }

  async start(): Promise<DesktopUpdateStatus> {
    if (this.status.phase === 'checking') return this.status;
    this.setStatus('checking', '正在检查更新…');
    try {
      const policy = await this.loadPolicy();
      if (policy.status === 'supported') {
        this.setStatus('current', '当前已是最新推荐版本。');
      } else if (!policy.downloadUrl) {
        throw new Error('安装包尚未发布，请稍后重试。');
      } else {
        await this.openDownloadPage();
        this.setStatus(
          'manual',
          '已打开下载页。下载后退出 MarkFix，运行安装包覆盖安装；本机数据会保留。',
        );
      }
    } catch (error) {
      this.setStatus(
        'error',
        error instanceof Error ? error.message : '无法打开下载页，请稍后重试。',
      );
    }
    return this.status;
  }

  private setStatus(phase: DesktopUpdateStatus['phase'], message: string): void {
    this.status = { phase, message };
    this.notify(this.status);
  }
}
