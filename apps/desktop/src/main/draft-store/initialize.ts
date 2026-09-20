import type Database from 'better-sqlite3';
import { draftStoreSchema } from './schema.js';

const currentVersion = 3;

export const initializeDraftStore = (database: Database.Database): void => {
  const version = database.pragma('user_version', { simple: true }) as number;
  if (version === currentVersion) return;
  const existing = database
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    )
    .get();
  if (version !== 0 || existing) {
    throw new Error(
      `Unsupported MarkFix database version ${version}; expected ${currentVersion}. Existing data was not changed.`,
    );
  }
  database.transaction(() => {
    database.exec(draftStoreSchema);
    database.pragma(`user_version = ${currentVersion}`);
  })();
};
