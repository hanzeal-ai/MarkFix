import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

// Never include annotation text, URLs, screenshots, tokens or raw error messages.
export function logAnnotationSave(stage: string, error?: unknown): void {
  try {
    const directory = app.getPath('logs');
    mkdirSync(directory, { recursive: true });
    const file = join(directory, 'annotation-save.log');
    try {
      if (statSync(file).size >= 1024 * 1024) renameSync(file, file + '.1');
    } catch {
      /* The first write has no existing file. */
    }
    const status =
      error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : undefined;
    const category =
      error instanceof Error &&
      ['ZodError', 'TypeError', 'AbortError', 'TimeoutError', 'MarkFixApiError'].includes(
        error.name,
      )
        ? error.name
        : error !== undefined
          ? 'Error'
          : undefined;
    appendFileSync(
      file,
      JSON.stringify({
        time: new Date().toISOString(),
        version: app.getVersion(),
        platform: process.platform,
        stage,
        status,
        failed: error !== undefined,
        category,
      }) + '\n',
    );
  } catch {
    /* Diagnostics must never prevent saving. */
  }
}
