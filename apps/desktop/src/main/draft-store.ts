import Database from 'better-sqlite3';
import type { SavedCapture } from '@markfix/contracts';
import { retryDelayMs } from './sync-policy.js';

export type OutboxEntry = {
  id: string;
  idempotencyKey: string;
  payload: unknown;
  attempts: number;
};

export class DraftStore {
  private readonly database: Database.Database;

  constructor(path: string) {
    this.database = new Database(path);
    this.database.pragma('journal_mode = WAL');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        request_hash TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        last_error TEXT,
        report_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS outbox_due_idx ON outbox(status, next_attempt_at);
      CREATE TABLE IF NOT EXISTS capture_annotations (
        id TEXT PRIMARY KEY,
        page_url TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS capture_annotations_page_idx
        ON capture_annotations(page_url, created_at);
    `);
  }

  load(): unknown | undefined {
    const row = this.database.prepare('SELECT payload FROM drafts WHERE id = ?').get('current') as
      | { payload: string }
      | undefined;
    return row ? (JSON.parse(row.payload) as unknown) : undefined;
  }

  save(payload: unknown): void {
    this.database
      .prepare(
        `INSERT INTO drafts (id, payload, updated_at) VALUES ('current', ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(payload), new Date().toISOString());
  }

  clear(): void {
    this.database.prepare('DELETE FROM drafts WHERE id = ?').run('current');
  }

  listCaptures(): SavedCapture[] {
    const rows = this.database
      .prepare('SELECT payload FROM capture_annotations ORDER BY created_at ASC')
      .all() as Array<{ payload: string }>;
    return rows.map(({ payload }) => JSON.parse(payload) as SavedCapture);
  }

  saveCapture(capture: SavedCapture): void {
    this.database
      .prepare(
        `INSERT INTO capture_annotations (id, page_url, payload, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET page_url = excluded.page_url, payload = excluded.payload`,
      )
      .run(capture.id, capture.pageUrl, JSON.stringify(capture), capture.createdAt);
  }

  deleteCapture(id: string): void {
    this.database.prepare('DELETE FROM capture_annotations WHERE id = ?').run(id);
  }

  enqueue(payload: unknown, requestHash: string): OutboxEntry {
    const existing = this.database
      .prepare(
        `SELECT id, idempotency_key AS idempotencyKey, payload, attempts
         FROM outbox WHERE request_hash = ? AND status IN ('PENDING', 'SYNCING')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(requestHash) as
      | { id: string; idempotencyKey: string; payload: string; attempts: number }
      | undefined;
    if (existing) return { ...existing, payload: JSON.parse(existing.payload) as unknown };

    const now = new Date().toISOString();
    const entry: OutboxEntry = {
      id: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      payload,
      attempts: 0,
    };
    this.database
      .prepare(
        `INSERT INTO outbox
         (id, idempotency_key, request_hash, payload, status, attempts, next_attempt_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.idempotencyKey,
        requestHash,
        JSON.stringify(payload),
        Date.now(),
        now,
        now,
      );
    return entry;
  }

  claimDue(limit = 5): OutboxEntry[] {
    const rows = this.database
      .prepare(
        `SELECT id, idempotency_key AS idempotencyKey, payload, attempts
         FROM outbox WHERE status = 'PENDING' AND next_attempt_at <= ?
         ORDER BY created_at ASC LIMIT ?`,
      )
      .all(Date.now(), limit) as Array<{
      id: string;
      idempotencyKey: string;
      payload: string;
      attempts: number;
    }>;
    const claim = this.database.prepare(
      `UPDATE outbox SET status = 'SYNCING', updated_at = ? WHERE id = ? AND status = 'PENDING'`,
    );
    return rows
      .filter(({ id }) => claim.run(new Date().toISOString(), id).changes === 1)
      .map((row) => ({ ...row, payload: JSON.parse(row.payload) as unknown }));
  }

  markCompleted(id: string, reportId: string): void {
    this.database
      .prepare(`UPDATE outbox SET status = 'COMPLETED', report_id = ?, updated_at = ? WHERE id = ?`)
      .run(reportId, new Date().toISOString(), id);
  }

  markFailed(id: string, attempts: number, error: string): void {
    this.database
      .prepare(
        `UPDATE outbox SET status = 'PENDING', attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        attempts,
        Date.now() + retryDelayMs(attempts),
        error.slice(0, 1000),
        new Date().toISOString(),
        id,
      );
  }

  outboxStatus(id: string): { status: string; reportId?: string } | undefined {
    const row = this.database
      .prepare('SELECT status, report_id AS reportId FROM outbox WHERE id = ?')
      .get(id) as { status: string; reportId: string | null } | undefined;
    if (!row) return undefined;
    return row.reportId ? { status: row.status, reportId: row.reportId } : { status: row.status };
  }

  recoverInterrupted(): void {
    this.database
      .prepare(`UPDATE outbox SET status = 'PENDING', next_attempt_at = ? WHERE status = 'SYNCING'`)
      .run(Date.now());
  }

  close(): void {
    this.database.close();
  }
}
