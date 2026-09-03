import Database from 'better-sqlite3';

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

  close(): void {
    this.database.close();
  }
}
