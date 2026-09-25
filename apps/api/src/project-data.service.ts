import { requireProjectAccess } from './authorization.js';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@markfix/database';
import {
  annotationSubmissionSchema,
  cloudProjectStateSchema,
  savedCaptureSchema,
  savedDiagnosticAnnotationSchema,
  savedElementCommentSchema,
  type CloudProjectState,
  type SavedCapture,
  type SavedDiagnosticAnnotation,
  type SavedElementComment,
} from '@markfix/contracts';
import { DatabaseService } from './database.service.js';

type RecordKind = 'CAPTURE' | 'ELEMENT_COMMENT' | 'DIAGNOSTIC';
type AnnotationRecord = SavedCapture | SavedElementComment | SavedDiagnosticAnnotation;
type AnnotationRecordMetadata =
  | Omit<SavedCapture, 'dataUrl' | 'sourceDataUrl'>
  | Omit<SavedElementComment, 'screenshotDataUrl'>
  | SavedDiagnosticAnnotation;

const captureMetadataSchema = savedCaptureSchema.omit({ dataUrl: true, sourceDataUrl: true });
const elementCommentMetadataSchema = savedElementCommentSchema.omit({ screenshotDataUrl: true });

const pngDataUrl = (value: Uint8Array | null): string | undefined =>
  value ? `data:image/png;base64,${Buffer.from(value).toString('base64')}` : undefined;

const recordPayload = (kind: RecordKind, record: unknown): Prisma.InputJsonValue => {
  if (kind === 'CAPTURE') {
    return captureMetadataSchema.parse(record) as Prisma.InputJsonValue;
  }
  if (kind === 'ELEMENT_COMMENT') {
    return elementCommentMetadataSchema.parse(record) as Prisma.InputJsonValue;
  }
  return savedDiagnosticAnnotationSchema.parse(record) as Prisma.InputJsonValue;
};

const recordMetadata = (kind: RecordKind, input: unknown): AnnotationRecordMetadata => {
  if (kind === 'CAPTURE') return captureMetadataSchema.parse(input);
  if (kind === 'ELEMENT_COMMENT') return elementCommentMetadataSchema.parse(input);
  return savedDiagnosticAnnotationSchema.parse(input);
};

const hydrateRecord = (row: {
  kind: RecordKind;
  payload: unknown;
  renderedPng: Uint8Array | null;
  sourcePng: Uint8Array | null;
}): AnnotationRecord => {
  if (row.kind === 'CAPTURE') {
    const dataUrl = pngDataUrl(row.renderedPng);
    const sourceDataUrl = pngDataUrl(row.sourcePng);
    if (!dataUrl || !sourceDataUrl) throw new Error('Cloud capture image data is incomplete');
    return savedCaptureSchema.parse({ ...(row.payload as object), dataUrl, sourceDataUrl });
  }
  if (row.kind === 'ELEMENT_COMMENT') {
    const screenshotDataUrl = pngDataUrl(row.renderedPng);
    return savedElementCommentSchema.parse({
      ...(row.payload as object),
      ...(screenshotDataUrl ? { screenshotDataUrl } : {}),
    });
  }
  return savedDiagnosticAnnotationSchema.parse(row.payload);
};

@Injectable()
export class ProjectDataService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getState(userId: string, projectId: string): Promise<CloudProjectState | null> {
    const project = await requireProjectAccess(this.database, userId, projectId);
    const state = await this.database.projectDesktopState.findUnique({ where: { projectId } });
    if (!state) return null;
    const parsed = cloudProjectStateSchema.parse({
      ...(state.payload as object),
      revision: state.revision,
    });
    return { ...parsed, project: this.canonicalProject(project, parsed.project) };
  }

  async saveState(userId: string, projectId: string, input: unknown): Promise<CloudProjectState> {
    const project = await requireProjectAccess(this.database, userId, projectId);
    const state = cloudProjectStateSchema.parse(input);
    if (state.project.id !== projectId) throw new ConflictException('Project ID mismatch');
    const canonical = { ...state, project: this.canonicalProject(project, state.project) };
    const { revision, ...payload } = canonical;
    const saved = await this.database.$transaction(async (transaction) => {
      const current = await transaction.projectDesktopState.findUnique({ where: { projectId } });
      if ((current?.revision ?? 0) !== revision)
        throw new ConflictException('Cloud project state has changed; reload before retrying');
      if (!current)
        return transaction.projectDesktopState.create({
          data: { projectId, payload: payload as Prisma.InputJsonValue, revision: 1 },
        });
      const updated = await transaction.projectDesktopState.updateMany({
        where: { projectId, revision },
        data: { payload: payload as Prisma.InputJsonValue, revision: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException('Cloud project state has changed; reload before retrying');
      const result = await transaction.projectDesktopState.findUnique({ where: { projectId } });
      if (!result) throw new NotFoundException('Cloud project state not found');
      return result;
    });
    return cloudProjectStateSchema.parse({
      ...(saved.payload as object),
      revision: saved.revision,
    });
  }

  async listRecords(
    userId: string,
    projectId: string,
    kind: RecordKind,
  ): Promise<AnnotationRecord[]> {
    await requireProjectAccess(this.database, userId, projectId);
    const rows = await this.database.projectAnnotationRecord.findMany({
      where: { projectId, kind, ready: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => hydrateRecord({ ...row, kind }));
  }

  async saveRecord(
    userId: string,
    projectId: string,
    kind: RecordKind,
    input: unknown,
  ): Promise<{ saved: true }> {
    await requireProjectAccess(this.database, userId, projectId);
    const parsed = recordMetadata(kind, input);
    if (parsed.projectId !== projectId) throw new ConflictException('Project ID mismatch');
    const stored = recordPayload(kind, parsed);
    const hasScreenshot = (input as { hasScreenshot?: unknown }).hasScreenshot === true;
    const ready = kind === 'DIAGNOSTIC' || (kind === 'ELEMENT_COMMENT' && !hasScreenshot);
    await this.database.$transaction(
      async (transaction) => {
        const current = await transaction.projectAnnotationRecord.findUnique({
          where: { id: parsed.id },
        });
        if (current && (current.projectId !== projectId || current.kind !== kind))
          throw new ConflictException('Annotation identity belongs to another project or kind');
        if (current && current.updatedAt.toISOString() > parsed.updatedAt)
          throw new ConflictException('Cloud annotation has changed; reload before retrying');
        return transaction.projectAnnotationRecord.upsert({
          where: { id: parsed.id },
          create: {
            id: parsed.id,
            projectId,
            kind,
            pageUrl: parsed.pageUrl,
            status: parsed.status,
            payload: stored,
            renderedPng: null,
            sourcePng: null,
            ready,
            createdAt: new Date(parsed.createdAt),
            updatedAt: new Date(parsed.updatedAt),
          },
          update: {
            pageUrl: parsed.pageUrl,
            status: parsed.status,
            payload: stored,
            ready,
            ...(kind === 'CAPTURE' ? { renderedPng: null, sourcePng: null } : {}),
            ...(kind === 'ELEMENT_COMMENT' &&
            (input as { hasScreenshot?: unknown }).hasScreenshot === false
              ? { renderedPng: null }
              : {}),
            updatedAt: new Date(parsed.updatedAt),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { saved: true };
  }

  async saveRecordImage(
    userId: string,
    projectId: string,
    kind: RecordKind,
    id: string,
    slot: 'rendered' | 'source',
    expectedUpdatedAt: string,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<{ saved: true }> {
    await requireProjectAccess(this.database, userId, projectId);
    if (kind !== 'CAPTURE' && slot === 'source')
      throw new ConflictException('Only capture records have source images');
    if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024)
      throw new ConflictException('Screenshot must be between 1 byte and 20 MB');
    await this.database.$transaction(async (transaction) => {
      const current = await transaction.projectAnnotationRecord.findUnique({ where: { id } });
      if (
        !current ||
        current.projectId !== projectId ||
        current.kind !== kind ||
        current.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()
      )
        throw new ConflictException('Cloud annotation changed before its image upload completed');
      const result = await transaction.projectAnnotationRecord.updateMany({
        where: { id, projectId, kind, updatedAt: new Date(expectedUpdatedAt) },
        data: {
          ...(slot === 'rendered' ? { renderedPng: bytes } : { sourcePng: bytes }),
          updatedAt: new Date(expectedUpdatedAt),
        },
      });
      if (result.count !== 1) throw new NotFoundException('Annotation record not found');
      const record = await transaction.projectAnnotationRecord.findUnique({ where: { id } });
      const ready =
        kind === 'CAPTURE'
          ? Boolean(record?.renderedPng && record.sourcePng)
          : Boolean(record?.renderedPng);
      if (ready)
        await transaction.projectAnnotationRecord.update({
          where: { id },
          data: { ready: true, updatedAt: new Date(expectedUpdatedAt) },
        });
    });
    return { saved: true };
  }

  async deleteRecord(
    userId: string,
    projectId: string,
    kind: RecordKind,
    id: string,
  ): Promise<{ deleted: true }> {
    await requireProjectAccess(this.database, userId, projectId);
    const result = await this.database.projectAnnotationRecord.deleteMany({
      where: { id, projectId, kind },
    });
    if (result.count !== 1) throw new NotFoundException('Annotation record not found');
    return { deleted: true };
  }

  async saveSubmission(
    userId: string,
    projectId: string,
    input: unknown,
  ): Promise<{ saved: true }> {
    await requireProjectAccess(this.database, userId, projectId);
    const submission = annotationSubmissionSchema.parse(input);
    if (submission.projectId !== projectId) throw new ConflictException('Project ID mismatch');
    const records = [
      ...submission.elementComments,
      ...submission.captures,
      ...submission.diagnostics,
    ];
    if (records.length === 0)
      throw new ConflictException('Annotation submission must contain at least one record');
    if (records.some((record) => record.projectId !== projectId))
      throw new ConflictException('Annotation project mismatch');
    const ids = records.map(({ id }) => id);
    if (new Set(ids).size !== ids.length)
      throw new ConflictException('Annotation submission contains duplicate records');
    const batchPayload = {
      elementCommentIds: submission.elementComments.map(({ id }) => id),
      captureIds: submission.captures.map(({ id }) => id),
      diagnosticAnnotationIds: submission.diagnostics.map(({ id }) => id),
    };
    const expectedRecords = [
      ...submission.elementComments.map(({ id }) => ({ id, kind: 'ELEMENT_COMMENT' as const })),
      ...submission.captures.map(({ id }) => ({ id, kind: 'CAPTURE' as const })),
      ...submission.diagnostics.map(({ id }) => ({ id, kind: 'DIAGNOSTIC' as const })),
    ];
    await this.database.$transaction(async (transaction) => {
      const found = await transaction.projectAnnotationRecord.findMany({
        where: { projectId, id: { in: ids }, ready: true },
        select: { id: true, kind: true },
      });
      const foundKinds = new Map(found.map(({ id, kind }) => [id, kind]));
      if (expectedRecords.some(({ id, kind }) => foundKinds.get(id) !== kind))
        throw new ConflictException('One or more cloud annotations are missing');
      const existingBatch = await transaction.projectAnnotationBatch.findUnique({
        where: { id: submission.id },
      });
      if (
        existingBatch &&
        (existingBatch.projectId !== projectId ||
          JSON.stringify(existingBatch.payload) !== JSON.stringify(batchPayload))
      )
        throw new ConflictException('Submission identity was already used for another payload');
      if (!existingBatch)
        await transaction.projectAnnotationBatch.create({
          data: {
            id: submission.id,
            projectId,
            submittedAt: new Date(submission.submittedAt),
            payload: batchPayload,
          },
        });
      for (const record of records) {
        const kind: RecordKind =
          'dataUrl' in record ? 'CAPTURE' : 'anchor' in record ? 'ELEMENT_COMMENT' : 'DIAGNOSTIC';
        const submitted = {
          ...record,
          status: 'submitted' as const,
          submittedAt: submission.submittedAt,
          updatedAt: submission.submittedAt,
        };
        const payload = recordPayload(kind, submitted);
        const updated = await transaction.projectAnnotationRecord.updateMany({
          where: { id: record.id, projectId, kind, ready: true },
          data: {
            status: 'submitted',
            payload,
            updatedAt: new Date(submission.submittedAt),
          },
        });
        if (updated.count !== 1)
          throw new ConflictException('Cloud annotation changed during submission');
      }
    });
    return { saved: true };
  }

  private canonicalProject(
    project: {
      id: string;
      name: string;
      baseUrl: string | null;
      createdAt: Date;
    },
    candidate: CloudProjectState['project'],
  ): CloudProjectState['project'] {
    if (!project.baseUrl) throw new ConflictException('Cloud website project has no base URL');
    const origin = new URL(project.baseUrl).origin;
    if (new URL(candidate.entryUrl).origin !== origin)
      throw new ConflictException('Cloud project entry URL does not match its website origin');
    return {
      ...candidate,
      id: project.id,
      title: project.name,
      origin,
      createdAt: project.createdAt.toISOString(),
    };
  }
}
