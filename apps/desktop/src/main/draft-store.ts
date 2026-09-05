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
  type AnnotationHistorySummary,
  type DesktopDraft,
  type SavedCapture,
  type SavedDiagnosticAnnotation,
  type SavedElementComment,
  type WebsiteProject,
} from '@markfix/contracts';
import { retryDelayMs } from './sync-policy.js';
import {
  captureStorage,
  hydrateCapture,
  type StoredCapture,
} from './draft-store/capture-codec.js';
import { draftStoreSchema } from './draft-store/schema.js';

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
    this.database.exec(draftStoreSchema);
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

  deleteWebsiteProject(projectId: string): void {
    const remove = this.database.transaction(() => {
      const projectPayloadMatch = "json_extract(payload, '$.projectId') = ?";
      this.database.prepare(`DELETE FROM drafts WHERE ${projectPayloadMatch}`).run(projectId);
      this.database.prepare(`DELETE FROM outbox WHERE ${projectPayloadMatch}`).run(projectId);
      this.database.prepare('DELETE FROM capture_annotations WHERE project_id = ?').run(projectId);
      this.database.prepare('DELETE FROM element_comments WHERE project_id = ?').run(projectId);
      this.database
        .prepare('DELETE FROM diagnostic_annotations WHERE project_id = ?')
        .run(projectId);
      this.database
        .prepare(
          `DELETE FROM submission_capture_images
           WHERE submission_id IN (SELECT id FROM annotation_submissions WHERE project_id = ?)`,
        )
        .run(projectId);
      this.database
        .prepare('DELETE FROM annotation_submissions WHERE project_id = ?')
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
      { payload: string } | undefined;
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

  listCaptures(projectId?: string): SavedCapture[] {
    const rows = this.database
      .prepare(
        `SELECT payload, rendered_png AS renderedPng, source_png AS sourcePng
         FROM capture_annotations
         ${projectId ? 'WHERE project_id = ?' : ''}
         ORDER BY created_at ASC`,
      )
      .all(...(projectId ? [projectId] : [])) as Array<{
      payload: string;
      renderedPng: Buffer;
      sourcePng: Buffer | null;
    }>;
    return rows.map(({ payload, renderedPng, sourcePng }) =>
      hydrateCapture(JSON.parse(payload) as StoredCapture, renderedPng, sourcePng),
    );
  }

  getCapture(id: string): SavedCapture | undefined {
    const row = this.database
      .prepare(
        `SELECT payload, rendered_png AS renderedPng, source_png AS sourcePng
         FROM capture_annotations WHERE id = ?`,
      )
      .get(id) as { payload: string; renderedPng: Buffer; sourcePng: Buffer | null } | undefined;
    return row
      ? hydrateCapture(JSON.parse(row.payload) as StoredCapture, row.renderedPng, row.sourcePng)
      : undefined;
  }

  saveCapture(capture: SavedCapture): void {
    const currentCapture = savedCaptureSchema.parse(capture);
    const stored = captureStorage(currentCapture);
    this.database
      .prepare(
        `INSERT INTO capture_annotations
         (id, page_url, payload, created_at, project_id, status, rendered_png, source_png)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           page_url = excluded.page_url,
           payload = excluded.payload,
           project_id = excluded.project_id,
           status = excluded.status,
           rendered_png = excluded.rendered_png,
           source_png = excluded.source_png`,
      )
      .run(
        currentCapture.id,
        currentCapture.pageUrl,
        JSON.stringify(stored.metadata),
        currentCapture.createdAt,
        currentCapture.projectId,
        currentCapture.status,
        stored.renderedPng,
        stored.sourcePng,
      );
  }

  deleteCapture(id: string): void {
    this.database.prepare('DELETE FROM capture_annotations WHERE id = ?').run(id);
  }

  listElementComments(projectId?: string): SavedElementComment[] {
    const rows = this.database
      .prepare(
        `SELECT payload FROM element_comments
         ${projectId ? 'WHERE project_id = ?' : ''}
         ORDER BY created_at ASC`,
      )
      .all(...(projectId ? [projectId] : [])) as Array<{ payload: string }>;
    return rows.map(({ payload }) => savedElementCommentSchema.parse(JSON.parse(payload)));
  }

  saveElementComment(comment: SavedElementComment): void {
    const currentComment = savedElementCommentSchema.parse(comment);
    this.database
      .prepare(
        `INSERT INTO element_comments
         (id, page_url, payload, created_at, updated_at, project_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           page_url = excluded.page_url,
           payload = excluded.payload,
           project_id = excluded.project_id,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .run(
        currentComment.id,
        currentComment.pageUrl,
        JSON.stringify(currentComment),
        currentComment.createdAt,
        currentComment.updatedAt,
        currentComment.projectId,
        currentComment.status,
      );
  }

  deleteElementComment(id: string): void {
    this.database.prepare('DELETE FROM element_comments WHERE id = ?').run(id);
  }

  listDiagnosticAnnotations(projectId?: string): SavedDiagnosticAnnotation[] {
    const rows = this.database
      .prepare(
        `SELECT payload FROM diagnostic_annotations
         ${projectId ? 'WHERE project_id = ?' : ''}
         ORDER BY created_at ASC`,
      )
      .all(...(projectId ? [projectId] : [])) as Array<{ payload: string }>;
    return rows.map(({ payload }) => savedDiagnosticAnnotationSchema.parse(JSON.parse(payload)));
  }

  saveDiagnosticAnnotation(annotation: SavedDiagnosticAnnotation): void {
    const current = savedDiagnosticAnnotationSchema.parse(annotation);
    this.database
      .prepare(
        `INSERT INTO diagnostic_annotations
         (id, page_url, payload, created_at, updated_at, project_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           page_url = excluded.page_url,
           payload = excluded.payload,
           project_id = excluded.project_id,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .run(
        current.id,
        current.pageUrl,
        JSON.stringify(current),
        current.createdAt,
        current.updatedAt,
        current.projectId,
        current.status,
      );
  }

  deleteDiagnosticAnnotation(id: string): void {
    this.database.prepare('DELETE FROM diagnostic_annotations WHERE id = ?').run(id);
  }

  listAnnotationHistorySummaries(): AnnotationHistorySummary[] {
    const rows = this.database
      .prepare(
        `SELECT project_id AS projectId, status, COUNT(*) AS count, MAX(updated_at) AS updatedAt
         FROM (
           SELECT project_id, status, created_at AS updated_at FROM capture_annotations
           UNION ALL
           SELECT project_id, status, updated_at FROM element_comments
           UNION ALL
           SELECT project_id, status, updated_at FROM diagnostic_annotations
         ) records
         WHERE project_id IS NOT NULL
         GROUP BY project_id, status`,
      )
      .all() as Array<{
      projectId: string;
      status: 'draft' | 'submitted' | 'rejected';
      count: number;
      updatedAt: string;
    }>;
    const summaries = new Map<string, AnnotationHistorySummary>();
    for (const row of rows) {
      const summary = summaries.get(row.projectId) ?? {
        projectId: row.projectId,
        total: 0,
        draft: 0,
        submitted: 0,
        rejected: 0,
        updatedAt: row.updatedAt,
      };
      summary.total += row.count;
      summary[row.status] += row.count;
      if (row.updatedAt > summary.updatedAt) summary.updatedAt = row.updatedAt;
      summaries.set(row.projectId, summary);
    }
    return [...summaries.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
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
      const compactSubmission = {
        ...currentSubmission,
        captures: currentSubmission.captures.map((capture) => captureStorage(capture).metadata),
      };
      this.database
        .prepare(
          `INSERT INTO annotation_submissions
           (id, payload, submitted_at, project_id) VALUES (?, ?, ?, ?)`,
        )
        .run(
          currentSubmission.id,
          JSON.stringify(compactSubmission),
          currentSubmission.submittedAt,
          currentSubmission.projectId,
        );
      const saveSubmissionImage = this.database.prepare(
        `INSERT INTO submission_capture_images
         (submission_id, capture_id, rendered_png, source_png) VALUES (?, ?, ?, ?)`,
      );
      for (const capture of currentSubmission.captures) {
        const stored = captureStorage(capture);
        saveSubmissionImage.run(
          currentSubmission.id,
          capture.id,
          stored.renderedPng,
          stored.sourcePng,
        );
      }
      const updateElementComment = this.database.prepare(
        `UPDATE element_comments
         SET payload = ?, status = 'submitted', updated_at = ? WHERE id = ?`,
      );
      const updateCapture = this.database.prepare(
        `UPDATE capture_annotations
         SET payload = ?, status = 'submitted', rendered_png = ?, source_png = ? WHERE id = ?`,
      );
      const updateDiagnostic = this.database.prepare(
        `UPDATE diagnostic_annotations
         SET payload = ?, status = 'submitted', updated_at = ? WHERE id = ?`,
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
        const stored = captureStorage(updated);
        updateCapture.run(
          JSON.stringify(stored.metadata),
          stored.renderedPng,
          stored.sourcePng,
          capture.id,
        );
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
    const elementComments = this.listElementComments(projectId).filter(
      (record) => record.status === 'draft',
    );
    const captures = this.listCaptures(projectId).filter((record) => record.status === 'draft');
    const diagnostics = this.listDiagnosticAnnotations(projectId).filter(
      (record) => record.status === 'draft',
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
      .prepare('SELECT id, payload FROM annotation_submissions ORDER BY submitted_at ASC')
      .all() as Array<{ id: string; payload: string }>;
    const imageRows = this.database
      .prepare(
        `SELECT submission_id AS submissionId, capture_id AS captureId,
                rendered_png AS renderedPng, source_png AS sourcePng
         FROM submission_capture_images`,
      )
      .all() as Array<{
      submissionId: string;
      captureId: string;
      renderedPng: Buffer;
      sourcePng: Buffer | null;
    }>;
    const images = new Map(
      imageRows.map((row) => [`${row.submissionId}:${row.captureId}`, row] as const),
    );
    return rows.map(({ id, payload }) => {
      const compact = JSON.parse(payload) as Omit<AnnotationSubmission, 'captures'> & {
        captures: StoredCapture[];
      };
      return annotationSubmissionSchema.parse({
        ...compact,
        captures: compact.captures.map((capture) => {
          const stored = images.get(`${id}:${capture.id}`);
          if (!stored) throw new Error(`Missing stored screenshot for capture ${capture.id}`);
          return hydrateCapture(capture, stored.renderedPng, stored.sourcePng);
        }),
      });
    });
  }

  enqueue(
    payload: unknown,
    requestHash: string,
    idempotencyKey: string = crypto.randomUUID(),
  ): OutboxEntry {
    const existing = this.database
      .prepare(
        `SELECT id, idempotency_key AS idempotencyKey, payload, attempts
         FROM outbox
         WHERE idempotency_key = ? OR (request_hash = ? AND status IN ('PENDING', 'SYNCING'))
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(idempotencyKey, requestHash) as
      { id: string; idempotencyKey: string; payload: string; attempts: number } | undefined;
    if (existing) return { ...existing, payload: JSON.parse(existing.payload) as unknown };

    const now = new Date().toISOString();
    const entry: OutboxEntry = {
      id: crypto.randomUUID(),
      idempotencyKey,
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
