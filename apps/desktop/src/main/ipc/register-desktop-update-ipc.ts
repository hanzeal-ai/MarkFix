import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  desktopUpdateChannels,
  desktopUpdateActive,
  type DesktopUpdateStatus,
} from '../../desktop-update';

export function registerDesktopUpdateIpc(options: {
  assertSender: (event: IpcMainInvokeEvent) => void;
  assertCanPrepare: () => void;
  preparationChanged: (preparing: boolean) => void;
  updater: {
    getStatus(): DesktopUpdateStatus;
    start(): DesktopUpdateStatus | Promise<DesktopUpdateStatus>;
  };
}) {
  let preparing = false;
  ipcMain.handle(desktopUpdateChannels.prepare, (event, input: unknown) => {
    options.assertSender(event);
    if (typeof input !== 'boolean') throw new Error('Invalid update preparation');
    if (input) {
      if (preparing || desktopUpdateActive(options.updater.getStatus()))
        throw new Error('更新正在进行，请稍候。');
      options.assertCanPrepare();
    }
    preparing = input;
    options.preparationChanged(preparing);
  });
  ipcMain.handle(desktopUpdateChannels.start, async (event) => {
    options.assertSender(event);
    if (!preparing) throw new Error('请先保存当前编辑后再更新。');
    return options.updater.start();
  });
  ipcMain.handle(desktopUpdateChannels.status, (event) => {
    options.assertSender(event);
    return preparing
      ? { phase: 'preparing', message: '正在保存当前批注…' }
      : options.updater.getStatus();
  });
}
