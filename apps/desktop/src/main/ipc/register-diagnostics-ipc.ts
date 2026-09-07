import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ipcChannels } from '@markfix/contracts';
import type { DiagnosticConsole } from '../diagnostic-console.js';

export const registerDiagnosticsIpc = ({
  assertSender,
  console: getConsole,
  setOpen,
}: {
  assertSender: (event: IpcMainInvokeEvent) => void;
  console: () => DiagnosticConsole | undefined;
  setOpen: (open: boolean) => void;
}): void => {
  ipcMain.handle(ipcChannels.diagnosticsSetOpen, (event, input: unknown) => {
    assertSender(event);
    if (typeof input !== 'boolean') throw new Error('Invalid diagnostics panel state');
    setOpen(input);
  });
  ipcMain.handle(ipcChannels.diagnosticsList, (event) => {
    assertSender(event);
    return getConsole()?.list() ?? [];
  });
  ipcMain.handle(ipcChannels.diagnosticsClear, (event, input: unknown) => {
    assertSender(event);
    if (input !== 'console' && input !== 'network' && input !== 'all')
      throw new Error('Invalid diagnostics clear scope');
    getConsole()?.clear(input);
  });
  ipcMain.handle(ipcChannels.diagnosticsEvaluate, async (event, input: unknown) => {
    assertSender(event);
    if (typeof input !== 'string' || input.length > 20_000) throw new Error('Invalid JavaScript');
    const diagnostics = getConsole();
    if (!diagnostics) throw new Error('Website diagnostics are unavailable');
    return diagnostics.evaluate(input);
  });
  ipcMain.handle(ipcChannels.diagnosticsRunCurl, async (event, input: unknown) => {
    assertSender(event);
    if (typeof input !== 'string' || input.length > 20_000) throw new Error('Invalid cURL command');
    const diagnostics = getConsole();
    if (!diagnostics) throw new Error('Website diagnostics are unavailable');
    return diagnostics.runCurl(input);
  });
};
