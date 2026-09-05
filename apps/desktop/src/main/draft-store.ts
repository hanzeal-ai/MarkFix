import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  annotationSubmissionSchema,
  desktopDraftSchema,
  savedCaptureSchema,
  savedDiagnosticAnnotationSchema,
  savedElementCommentSchema,
  websiteProjectSchema,
  type AnnotationSubmission,
  type DesktopDraft,
  type SavedCapture,
  type SavedDiagnosticAnnotation,
  type SavedElementComment,
  type WebsiteProject,
} from '@markfix/contracts';
import { retryDelayMs } from './sync-policy.js';

export type OutboxEntry = {
  id: string;
  idempotencyKey: string;
  payload: unknown;
  attempts: number;
};

const replaceProjectId = (value: unknown, previousId: string, projectId: string): unknown => {
  if (Array.isArray(value))
    return value.map((item) => replaceProjectId(item, previousId, projectId));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'projectId' && item === previousId
        ? projectId
        : replaceProjectId(item, previousId, projectId),
    ]),
  );
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
      CREATE TABLE IF NOT EXISTS element_comments (
        id TEXT PRIMARY KEY,
        page_url TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS element_comments_page_idx
        ON element_comments(page_url, created_at);
      CREATE TABLE IF NOT EXISTS diagnostic_annotations (
        id TEXT PRIMARY KEY,
        page_url TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS diagnostic_annotations_page_idx
        ON diagnostic_annotations(page_url, created_at);
      CREATE TABLE IF NOT EXISTS annotation_submissions (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        submitted_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS annotation_submissions_date_idx
        ON annotation_submissions(submitted_at);
      CREATE TABLE IF NOT EXISTS website_projects (
        id TEXT PRIMARY KEY,
        origin TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS website_projects_updated_idx
        ON website_projects(updated_at);
      CREATE TABLE IF NOT EXISTS page_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        page_title TEXT NOT NULL,
        visited_at TEXT NOT NULL,
        UNIQUE(project_id, page_url)
      );
      CREATE INDEX IF NOT EXISTS page_sessions_project_idx
        ON page_sessions(project_id, visited_at);
      CREATE TABLE IF NOT EXISTS project_navigation (
        project_id TEXT PRIMARY KEY,
        entries TEXT NOT NULL,
        current_index INTEGER NOT NULL
      );
    `);
  }

  listWebsiteProjects(): WebsiteProject[] {
    const rows = this.database
      .prepare('SELECT payload FROM website_projects ORDER BY updated_at DESC')
      .all() as Array<{ payload: string }>;
    return rows.map(({ payload }) => websiteProjectSchema.parse(JSON.parse(payload)));
  }

  getWebsiteProject(projectId: string): WebsiteProject | undefined {
    const row = this.database
      .prepare('SELECT payload FROM website_projects WHERE id = ?')
      .get(projectId) as { payload: string } | undefined;
    return row ? websiteProjectSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  findWebsiteProjectByOrigin(origin: string): WebsiteProject | undefined {
    const row = this.database
      .prepare('SELECT payload FROM website_projects WHERE origin = ?')
      .get(origin) as { payload: string } | undefined;
    return row ? websiteProjectSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  saveWebsiteProject(project: WebsiteProject): void {
    const currentProject = websiteProjectSchema.parse(project);
    this.database
      .prepare(
        `INSERT INTO website_projects (id, origin, payload, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           origin = excluded.origin,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
      )
      .run(
        currentProject.id,
        currentProject.origin,
        JSON.stringify(currentProject),
        currentProject.updatedAt,
      );
  }

  migrateWebsiteProject(previousId: string, project: WebsiteProject): WebsiteProject {
    const currentProject = websiteProjectSchema.parse(project);
    if (previousId === currentProject.id) {
      this.saveWebsiteProject(currentProject);
      return currentProject;
    }
    const previousProject = this.getWebsiteProject(previousId);
    if (!previousProject) throw new Error('Local website project to migrate was not found');
    if (previousProject.origin !== currentProject.origin)
      throw new Error('Website project origin changed during migration');
    if (this.getWebsiteProject(currentProject.id))
      throw new Error('Website project migration target already exists');

    const migrate = this.database.transaction(() => {
      const payloadTables = [
        'drafts',
        'outbox',
        'capture_annotations',
        'element_comments',
        'diagnostic_annotations',
        'annotation_submissions',
      ] as const;
      for (const table of payloadTables) {
        const rows = this.database.prepare(`SELECT rowid, payload FROM ${table}`).all() as Array<{
          rowid: number;
          payload: string;
        }>;
        const update = this.database.prepare(`UPDATE ${table} SET payload = ? WHERE rowid = ?`);
        for (const row of rows) {
          const payload = JSON.parse(row.payload) as unknown;
          const migrated = replaceProjectId(payload, previousId, currentProject.id);
          const serialized = JSON.stringify(migrated);
          if (serialized !== row.payload) update.run(serialized, row.rowid);
        }
      }
      this.database
        .prepare('UPDATE page_sessions SET project_id = ? WHERE project_id = ?')
        .run(currentProject.id, previousId);
      this.database
        .prepare('UPDATE project_navigation SET project_id = ? WHERE project_id = ?')
        .run(currentProject.id, previousId);
      this.database.prepare('DELETE FROM website_projects WHERE id = ?').run(previousId);
      this.saveWebsiteProject(currentProject);
    });
    migrate();
    return currentProject;
  }

  deleteWebsiteProject(projectId: string): void {
    const remove = this.database.transaction(() => {
      const projectPayloadMatch = "json_extract(payload, '$.projectId') = ?";
      this.database.prepare(`DELETE FROM drafts WHERE ${projectPayloadMatch}`).run(projectId);
      this.database.prepare(`DELETE FROM outbox WHERE ${projectPayloadMatch}`).run(projectId);
      this.database
        .prepare(`DELETE FROM capture_annotations WHERE ${projectPayloadMatch}`)
        .run(projectId);
      this.database
        .prepare(`DELETE FROM element_comments WHERE ${projectPayloadMatch}`)
        .run(projectId);
      this.database
        .prepare(`DELETE FROM diagnostic_annotations WHERE ${projectPayloadMatch}`)
        .run(projectId);
      this.database
        .prepare(`DELETE FROM annotation_submissions WHERE ${projectPayloadMatch}`)
        .run(projectId);
      this.database.prepare('DELETE FROM page_sessions WHERE project_id = ?').run(projectId);
      this.database.prepare('DELETE FROM project_navigation WHERE project_id = ?').run(projectId);
      this.database.prepare('DELETE FROM website_projects WHERE id = ?').run(projectId);
    });
    remove();
  }

  recordProjectPage(
    projectId: string,
    pageUrl: string,
    pageTitle: string,
  ): WebsiteProject | undefined {
    const project = this.getWebsiteProject(projectId);
    if (!project) return undefined;
    const existing = this.database
      .prepare('SELECT id FROM page_sessions WHERE project_id = ? AND page_url = ?')
      .get(projectId, pageUrl) as { id: string } | undefined;
    const pageSessionId = existing?.id ?? randomUUID();
    const visitedAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO page_sessions (id, project_id, page_url, page_title, visited_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id, page_url) DO UPDATE SET
           page_title = excluded.page_title,
           visited_at = excluded.visited_at`,
      )
      .run(pageSessionId, projectId, pageUrl, pageTitle, visitedAt);
    const navigationRow = this.database
      .prepare(
        'SELECT entries, current_index AS currentIndex FROM project_navigation WHERE project_id = ?',
      )
      .get(projectId) as { entries: string; currentIndex: number } | undefined;
    let entries = navigationRow
      ? (JSON.parse(navigationRow.entries) as Array<{
          pageSessionId: string;
          url: string;
          title: string;
        }>)
      : [];
    let currentIndex = navigationRow?.currentIndex ?? -1;
    if (entries[currentIndex]?.url === pageUrl) {
      entries[currentIndex] = { pageSessionId, url: pageUrl, title: pageTitle };
    } else {
      entries = [
        ...entries.slice(0, currentIndex + 1),
        { pageSessionId, url: pageUrl, title: pageTitle },
      ].slice(-200);
      currentIndex = entries.length - 1;
    }
    this.database
      .prepare(
        `INSERT INTO project_navigation (project_id, entries, current_index) VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           entries = excluded.entries,
           current_index = excluded.current_index`,
      )
      .run(projectId, JSON.stringify(entries), currentIndex);
    const updated: WebsiteProject = {
      ...project,
      currentPageSessionId: pageSessionId,
      currentUrl: pageUrl,
      updatedAt: visitedAt,
    };
    this.saveWebsiteProject(updated);
    return updated;
  }

  stepProjectHistory(
    projectId: string,
    offset: -1 | 1,
  ): { pageSessionId: string; url: string; title: string } | undefined {
    const row = this.database
      .prepare(
        'SELECT entries, current_index AS currentIndex FROM project_navigation WHERE project_id = ?',
      )
      .get(projectId) as { entries: string; currentIndex: number } | undefined;
    if (!row) return undefined;
    const entries = JSON.parse(row.entries) as Array<{
      pageSessionId: string;
      url: string;
      title: string;
    }>;
    const nextIndex = row.currentIndex + offset;
    const entry = entries[nextIndex];
    if (!entry) return undefined;
    this.database
      .prepare('UPDATE project_navigation SET current_index = ? WHERE project_id = ?')
      .run(nextIndex, projectId);
    return entry;
  }

  load(): DesktopDraft | undefined {
    const row = this.database.prepare('SELECT payload FROM drafts WHERE id = ?').get('current') as
      | { payload: string }
      | undefined;
    return row ? desktopDraftSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  save(payload: DesktopDraft): void {
    const draft = desktopDraftSchema.parse(payload);
    this.database
      .prepare(
        `INSERT INTO drafts (id, payload, updated_at) VALUES ('current', ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(draft), new Date().toISOString());
  }

  clear(): void {
    this.database.prepare('DELETE FROM drafts WHERE id = ?').run('current');
  }

  listCaptures(): SavedCapture[] {
    const rows = this.database
      .prepare('SELECT payload FROM capture_annotations ORDER BY created_at ASC')
      .all() as Array<{ payload: string }>;
    return rows.map(({ payload }) => savedCaptureSchema.parse(JSON.parse(payload)));
  }

  getCapture(id: string): SavedCapture | undefined {
    const row = this.database
      .prepare('SELECT payload FROM capture_annotations WHERE id = ?')
      .get(id) as { payload: string } | undefined;
    return row ? savedCaptureSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  saveCapture(capture: SavedCapture): void {
    const currentCapture = savedCaptureSchema.parse(capture);
    this.database
      .prepare(
        `INSERT INTO capture_annotations (id, page_url, payload, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET page_url = excluded.page_url, payload = excluded.payload`,
      )
      .run(
        currentCapture.id,
        currentCapture.pageUrl,
        JSON.stringify(currentCapture),
        currentCapture.createdAt,
      );
  }

  deleteCapture(id: string): void {
    this.database.prepare('DELETE FROM capture_annotations WHERE id = ?').run(id);
  }

  listElementComments(): SavedElementComment[] {
    const rows = this.database
      .prepare('SELECT payload FROM element_comments ORDER BY created_at ASC')
      .all() as Array<{ payload: string }>;
    return rows.map(({ payload }) => savedElementCommentSchema.parse(JSON.parse(payload)));
  }

  saveElementComment(comment: SavedElementComment): void {
    const currentComment = savedElementCommentSchema.parse(comment);
    this.database
      .prepare(
        `INSERT INTO element_comments (id, page_url, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           page_url = excluded.page_url,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
      )
      .run(
        currentComment.id,
        currentComment.pageUrl,
        JSON.stringify(currentComment),
        currentComment.createdAt,
        currentComment.updatedAt,
      );
  }

  deleteElementComment(id: string): void {
    this.database.prepare('DELETE FROM element_comments WHERE id = ?').run(id);
  }

  listDiagnosticAnnotations(): SavedDiagnosticAnnotation[] {
    const rows = this.database
      .prepare('SELECT payload FROM diagnostic_annotations ORDER BY created_at ASC')
      .all() as Array<{ payload: string }>;
    return rows.map(({ payload }) => savedDiagnosticAnnotationSchema.parse(JSON.parse(payload)));
  }

  saveDiagnosticAnnotation(annotation: SavedDiagnosticAnnotation): void {
    const current = savedDiagnosticAnnotationSchema.parse(annotation);
    this.database
      .prepare(
        `INSERT INTO diagnostic_annotations (id, page_url, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           page_url = excluded.page_url,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
      )
      .run(
        current.id,
        current.pageUrl,
        JSON.stringify(current),
        current.createdAt,
        current.updatedAt,
      );
  }

  deleteDiagnosticAnnotation(id: string): void {
    this.database.prepare('DELETE FROM diagnostic_annotations WHERE id = ?').run(id);
  }

  saveAnnotationSubmission(submission: AnnotationSubmission): void {
    const currentSubmission = annotationSubmissionSchema.parse(submission);
    const transaction = this.database.transaction(() => {
      const invalid = [
        ...currentSubmission.elementComments,
        ...currentSubmission.captures,
        ...currentSubmission.diagnostics,
      ].find(({ projectId }) => projectId !== currentSubmission.projectId);
      if (invalid) throw new Error('Annotation project mismatch');
      this.database
        .prepare(`INSERT INTO annotation_submissions (id, payload, submitted_at) VALUES (?, ?, ?)`)
        .run(
          currentSubmission.id,
          JSON.stringify(currentSubmission),
          currentSubmission.submittedAt,
        );
      const updateElementComment = this.database.prepare(
        'UPDATE element_comments SET payload = ?, updated_at = ? WHERE id = ?',
      );
      const updateCapture = this.database.prepare(
        'UPDATE capture_annotations SET payload = ? WHERE id = ?',
      );
      const updateDiagnostic = this.database.prepare(
        'UPDATE diagnostic_annotations SET payload = ?, updated_at = ? WHERE id = ?',
      );
      for (const comment of currentSubmission.elementComments) {
        const updated = {
          ...comment,
          status: 'submitted' as const,
          submittedAt: currentSubmission.submittedAt,
        };
        updateElementComment.run(
          JSON.stringify(updated),
          currentSubmission.submittedAt,
          comment.id,
        );
      }
      for (const capture of currentSubmission.captures) {
        const updated = {
          ...capture,
          status: 'submitted' as const,
          submittedAt: currentSubmission.submittedAt,
        };
        updateCapture.run(JSON.stringify(updated), capture.id);
      }
      for (const annotation of currentSubmission.diagnostics) {
        const updated = {
          ...annotation,
          status: 'submitted' as const,
          submittedAt: currentSubmission.submittedAt,
          updatedAt: currentSubmission.submittedAt,
        };
        updateDiagnostic.run(JSON.stringify(updated), currentSubmission.submittedAt, annotation.id);
      }
    });
    transaction();
  }

  submitProjectAnnotations(projectId: string): {
    elementCommentIds: string[];
    captureIds: string[];
    diagnosticAnnotationIds: string[];
    submittedAt: string;
  } {
    const elementComments = this.listElementComments().filter(
      (record) => record.projectId === projectId && record.status === 'draft',
    );
    const captures = this.listCaptures().filter(
      (record) => record.projectId === projectId && record.status === 'draft',
    );
    const diagnostics = this.listDiagnosticAnnotations().filter(
      (record) => record.projectId === projectId && record.status === 'draft',
    );
    if (elementComments.length + captures.length + diagnostics.length === 0)
      throw new Error('当前项目没有未提交标注');
    const submittedAt = new Date().toISOString();
    this.saveAnnotationSubmission({
      id: randomUUID(),
      projectId,
      elementComments,
      captures,
      diagnostics,
      submittedAt,
    });
    return {
      elementCommentIds: elementComments.map(({ id }) => id),
      captureIds: captures.map(({ id }) => id),
      diagnosticAnnotationIds: diagnostics.map(({ id }) => id),
      submittedAt,
    };
  }

  listAnnotationSubmissions(): AnnotationSubmission[] {
    const rows = this.database
      .prepare('SELECT payload FROM annotation_submissions ORDER BY submitted_at ASC')
      .all() as Array<{ payload: string }>;
    return rows.map(({ payload }) => annotationSubmissionSchema.parse(JSON.parse(payload)));
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
