import type Database from 'better-sqlite3';
import {
  annotationSubmissionSchema,
  savedCaptureSchema,
  type AnnotationSubmission,
} from '@markfix/contracts';
import { captureStorage, type StoredCapture } from './capture-codec.js';
import { draftStoreSchema } from './schema.js';

type Column = { name: string };

const tableExists = (database: Database.Database, table: string): boolean =>
  Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );

const columns = (database: Database.Database, table: string): Set<string> =>
  new Set(
    tableExists(database, table)
      ? (database.prepare(`PRAGMA table_info(${table})`).all() as Column[]).map(({ name }) => name)
      : [],
  );

const addMissingColumn = (
  database: Database.Database,
  table: string,
  knownColumns: Set<string>,
  name: string,
  declaration: string,
): void => {
  if (knownColumns.has(name)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${declaration}`);
  knownColumns.add(name);
};

const migrateCaptureRows = (database: Database.Database): void => {
  const rows = database
    .prepare(
      `SELECT id, payload, rendered_png AS renderedPng, source_png AS sourcePng
       FROM capture_annotations`,
    )
    .all() as Array<{
    id: string;
    payload: string;
    renderedPng: Buffer | null;
    sourcePng: Buffer | null;
  }>;
  const update = database.prepare(
    `UPDATE capture_annotations
     SET page_url = ?, payload = ?, created_at = ?, updated_at = ?, project_id = ?, status = ?,
         rendered_png = ?, source_png = ?
     WHERE id = ?`,
  );
  for (const row of rows) {
    const payload = JSON.parse(row.payload) as StoredCapture & {
      dataUrl?: unknown;
      sourceDataUrl?: unknown;
    };
    if (typeof payload.dataUrl === 'string' && typeof payload.sourceDataUrl === 'string') {
      const capture = savedCaptureSchema.parse(payload);
      const stored = captureStorage(capture);
      update.run(
        capture.pageUrl,
        JSON.stringify(stored.metadata),
        capture.createdAt,
        capture.updatedAt,
        capture.projectId,
        capture.status,
        stored.renderedPng,
        stored.sourcePng,
        row.id,
      );
      continue;
    }
    if (!row.renderedPng) throw new Error(`Missing stored screenshot for capture ${row.id}`);
    update.run(
      payload.pageUrl,
      JSON.stringify(payload),
      payload.createdAt,
      payload.updatedAt,
      payload.projectId,
      payload.status,
      row.renderedPng,
      row.sourcePng,
      row.id,
    );
  }
};

const migrateJsonRecordColumns = (
  database: Database.Database,
  table: 'element_comments' | 'diagnostic_annotations',
): void => {
  const rows = database.prepare(`SELECT id, payload FROM ${table}`).all() as Array<{
    id: string;
    payload: string;
  }>;
  const update = database.prepare(
    `UPDATE ${table} SET project_id = ?, status = ?, updated_at = ? WHERE id = ?`,
  );
  for (const row of rows) {
    const payload = JSON.parse(row.payload) as {
      projectId: string;
      status: string;
      updatedAt: string;
    };
    update.run(payload.projectId, payload.status, payload.updatedAt, row.id);
  }
};

const migrateSubmissionRows = (database: Database.Database): void => {
  const rows = database.prepare('SELECT id, payload FROM annotation_submissions').all() as Array<{
    id: string;
    payload: string;
  }>;
  const update = database.prepare(
    'UPDATE annotation_submissions SET payload = ?, project_id = ? WHERE id = ?',
  );
  const saveImage = database.prepare(
    `INSERT INTO submission_capture_images
     (submission_id, capture_id, rendered_png, source_png) VALUES (?, ?, ?, ?)
     ON CONFLICT(submission_id, capture_id) DO UPDATE SET
       rendered_png = excluded.rendered_png,
       source_png = excluded.source_png`,
  );
  for (const row of rows) {
    const payload = JSON.parse(row.payload) as AnnotationSubmission;
    const hasEmbeddedImages = payload.captures.some(
      (capture) => typeof (capture as { dataUrl?: unknown }).dataUrl === 'string',
    );
    if (!hasEmbeddedImages) {
      update.run(row.payload, payload.projectId, row.id);
      continue;
    }
    const submission = annotationSubmissionSchema.parse(payload);
    const storedCaptures = submission.captures.map((capture) => ({
      capture,
      stored: captureStorage(capture),
    }));
    const compact = {
      ...submission,
      captures: storedCaptures.map(({ stored }) => stored.metadata),
    };
    for (const { capture, stored } of storedCaptures) {
      saveImage.run(row.id, capture.id, stored.renderedPng, stored.sourcePng);
    }
    update.run(JSON.stringify(compact), submission.projectId, row.id);
  }
};

export const initializeDraftStore = (database: Database.Database): void => {
  const version = database.pragma('user_version', { simple: true }) as number;
  if (version >= 2) {
    database.exec(draftStoreSchema);
    return;
  }
  if (version < 1) {
    const migrate = database.transaction(() => {
      const captureColumns = columns(database, 'capture_annotations');
      if (captureColumns.size > 0) {
        addMissingColumn(database, 'capture_annotations', captureColumns, 'updated_at', 'TEXT');
        addMissingColumn(database, 'capture_annotations', captureColumns, 'project_id', 'TEXT');
        addMissingColumn(database, 'capture_annotations', captureColumns, 'status', 'TEXT');
        addMissingColumn(database, 'capture_annotations', captureColumns, 'rendered_png', 'BLOB');
        addMissingColumn(database, 'capture_annotations', captureColumns, 'source_png', 'BLOB');
      }

      for (const table of ['element_comments', 'diagnostic_annotations'] as const) {
        const recordColumns = columns(database, table);
        if (recordColumns.size === 0) continue;
        addMissingColumn(database, table, recordColumns, 'project_id', 'TEXT');
        addMissingColumn(database, table, recordColumns, 'status', 'TEXT');
      }

      const submissionColumns = columns(database, 'annotation_submissions');
      if (submissionColumns.size > 0)
        addMissingColumn(
          database,
          'annotation_submissions',
          submissionColumns,
          'project_id',
          'TEXT',
        );

      database.exec(draftStoreSchema);
      migrateCaptureRows(database);
      migrateJsonRecordColumns(database, 'element_comments');
      migrateJsonRecordColumns(database, 'diagnostic_annotations');
      migrateSubmissionRows(database);
      database.pragma('user_version = 1');
    });
    migrate();
  }

  const storageModeMigration = database.transaction(() => {
    const projectColumns = columns(database, 'website_projects');
    if (!projectColumns.has('storage_mode')) {
      database.exec(`
        ALTER TABLE website_projects RENAME TO website_projects_legacy;
        CREATE TABLE website_projects (
          id TEXT PRIMARY KEY,
          storage_mode TEXT NOT NULL,
          origin TEXT NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO website_projects (id, storage_mode, origin, payload, updated_at)
        SELECT id, 'CLOUD', origin, json_set(payload, '$.storageMode', 'CLOUD'), updated_at
        FROM website_projects_legacy;
        DROP TABLE website_projects_legacy;
      `);
    }
    database.exec(draftStoreSchema);
    database.pragma('user_version = 2');
  });
  storageModeMigration();
};
