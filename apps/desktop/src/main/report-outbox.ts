import { createHash, randomUUID } from 'node:crypto';
import { ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron';
import {
  captureBundleSchema,
  createReportSchema,
  ipcChannels,
  type CreateReport,
  type Report,
} from '@markfix/contracts';
import type { MarkFixApi } from '@markfix/api-client';
import type { DraftStore, OutboxEntry } from './draft-store.js';
import { optimizeReportScreenshot } from './report-screenshot-optimizer.js';

export class ReportOutbox {
  private syncing = false;

  constructor(
    private readonly api: MarkFixApi,
    private readonly store: () => DraftStore | undefined,
    private readonly canSync: () => boolean,
    private readonly canSubmitProject: (projectId: string) => boolean,
    private readonly assertSupportedClient: () => Promise<void>,
    private readonly afterAttempt: () => Promise<void>,
    private readonly sendShell: (channel: string, payload: unknown) => void,
  ) {}

  registerIpc(assertSender: (event: IpcMainInvokeEvent) => void): void {
    ipcMain.handle(ipcChannels.loadSyncStatus, (event, input: unknown) => {
      assertSender(event);
      if (typeof input !== 'string') throw new Error('Invalid outbox ID');
      return this.store()?.outboxStatus(input);
    });
    ipcMain.handle(ipcChannels.submitReport, async (event, input: unknown) => {
      assertSender(event);
      await this.assertSupportedClient();
      const payload = input as { report?: unknown; idempotencyKey?: unknown };
      const parsed = createReportSchema.parse(payload.report) as CreateReport;
      if (!this.canSubmitProject(parsed.projectId)) throw new Error('本地项目不能进入云端报告队列');
      const candidate = optimizeReportScreenshot(parsed, (dataUrl) =>
        nativeImage.createFromDataURL(dataUrl),
      );
      captureBundleSchema.parse(candidate.captureBundle);
      const store = this.store();
      if (!store) throw new Error('Local outbox is unavailable');
      const requestHash = createHash('sha256').update(JSON.stringify(candidate)).digest('hex');
      const idempotencyKey =
        typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : randomUUID();
      const entry = store.enqueue(candidate, requestHash, idempotencyKey);
      const synchronized = await this.flush();
      const status = store.outboxStatus(entry.id);
      const report = synchronized.get(entry.id);
      return status?.status === 'COMPLETED'
        ? { disposition: 'submitted', reportId: status.reportId, report }
        : { disposition: 'queued', outboxId: entry.id };
    });
  }

  async flush(): Promise<Map<string, Report>> {
    const reports = new Map<string, Report>();
    const store = this.store();
    if (this.syncing || !store || !this.canSync()) return reports;
    this.syncing = true;
    try {
      for (const entry of store.claimDue()) {
        const report = await this.syncEntry(entry);
        if (report) reports.set(entry.id, report);
      }
    } finally {
      this.syncing = false;
    }
    return reports;
  }

  private async syncEntry(entry: OutboxEntry): Promise<Report | undefined> {
    const store = this.store();
    if (!store) return undefined;
    try {
      const candidate = createReportSchema.parse(entry.payload);
      if (!this.canSubmitProject(candidate.projectId)) {
        store.markFailed(entry.id, entry.attempts + 1, '本地项目不能同步到云端');
        return undefined;
      }
      const report = await this.api.submitReport(candidate, entry.idempotencyKey);
      store.markCompleted(entry.id, report.id);
      this.sendShell(ipcChannels.syncStatus, {
        status: 'completed',
        outboxId: entry.id,
        reportId: report.id,
        report,
      });
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown synchronization failure';
      store.markFailed(entry.id, entry.attempts + 1, message);
      this.sendShell(ipcChannels.syncStatus, {
        status: 'pending',
        outboxId: entry.id,
        message,
      });
      return undefined;
    } finally {
      await this.afterAttempt();
    }
  }
}
