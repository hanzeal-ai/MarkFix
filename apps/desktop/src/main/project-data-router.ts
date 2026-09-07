import type {
  AnnotationHistorySummary,
  AnnotationSubmission,
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
  WebsiteProject,
} from '@markfix/contracts';
import type { MarkFixApi } from '@markfix/api-client';
import type { DraftStore } from './draft-store.js';

export class ProjectDataRouter {
  constructor(
    private readonly api: MarkFixApi,
    private readonly store: () => DraftStore | undefined,
    private readonly project: (projectId: string) => WebsiteProject | undefined,
  ) {}

  async listCaptures(projectId: string): Promise<SavedCapture[]> {
    return this.cloud(projectId)
      ? this.api.listCloudCaptures(projectId)
      : (this.localStore().listCaptures(projectId) ?? []);
  }

  async saveCapture(capture: SavedCapture): Promise<void> {
    if (this.cloud(capture.projectId)) await this.api.saveCloudCapture(capture);
    else this.localStore().saveCapture(capture);
  }

  async deleteCapture(projectId: string, id: string): Promise<void> {
    if (this.cloud(projectId)) await this.api.deleteCloudRecord(projectId, 'captures', id);
    else this.localStore().deleteCapture(id, projectId);
  }

  async listElementComments(projectId: string): Promise<SavedElementComment[]> {
    return this.cloud(projectId)
      ? this.api.listCloudElementComments(projectId)
      : this.localStore().listElementComments(projectId);
  }

  async saveElementComment(comment: SavedElementComment): Promise<void> {
    if (this.cloud(comment.projectId)) await this.api.saveCloudElementComment(comment);
    else this.localStore().saveElementComment(comment);
  }

  async deleteElementComment(projectId: string, id: string): Promise<void> {
    if (this.cloud(projectId)) await this.api.deleteCloudRecord(projectId, 'element-comments', id);
    else this.localStore().deleteElementComment(id, projectId);
  }

  async listDiagnostics(projectId: string): Promise<SavedDiagnosticAnnotation[]> {
    return this.cloud(projectId)
      ? this.api.listCloudDiagnostics(projectId)
      : this.localStore().listDiagnosticAnnotations(projectId);
  }

  async saveDiagnostic(annotation: SavedDiagnosticAnnotation): Promise<void> {
    if (this.cloud(annotation.projectId)) await this.api.saveCloudDiagnostic(annotation);
    else this.localStore().saveDiagnosticAnnotation(annotation);
  }

  async deleteDiagnostic(projectId: string, id: string): Promise<void> {
    if (this.cloud(projectId)) await this.api.deleteCloudRecord(projectId, 'diagnostics', id);
    else this.localStore().deleteDiagnosticAnnotation(id, projectId);
  }

  async saveSubmission(submission: AnnotationSubmission): Promise<void> {
    if (this.cloud(submission.projectId)) await this.api.saveCloudAnnotationSubmission(submission);
    else this.localStore().saveAnnotationSubmission(submission);
  }

  async listHistorySummaries(projects: WebsiteProject[]): Promise<AnnotationHistorySummary[]> {
    const localProjectIds = new Set(
      projects.filter(({ storageMode }) => storageMode === 'LOCAL').map(({ id }) => id),
    );
    const local = this.localStore()
      .listAnnotationHistorySummaries()
      .filter(({ projectId }) => localProjectIds.has(projectId));
    const cloud = await Promise.all(
      projects
        .filter(({ storageMode }) => storageMode === 'CLOUD')
        .map(async ({ id }) => {
          const records = [
            ...(await this.api.listCloudCaptures(id)),
            ...(await this.api.listCloudElementComments(id)),
            ...(await this.api.listCloudDiagnostics(id)),
          ];
          if (records.length === 0) return undefined;
          return records.reduce<AnnotationHistorySummary>(
            (summary, record) => {
              summary.total += 1;
              summary[record.status] += 1;
              if (record.updatedAt > summary.updatedAt) summary.updatedAt = record.updatedAt;
              return summary;
            },
            {
              projectId: id,
              total: 0,
              draft: 0,
              submitted: 0,
              rejected: 0,
              updatedAt: '',
            },
          );
        }),
    );
    return [
      ...local,
      ...cloud.filter((item): item is AnnotationHistorySummary => Boolean(item)),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private cloud(projectId: string): boolean {
    const project = this.project(projectId);
    if (!project) throw new Error('项目不存在或已被移除');
    return project.storageMode === 'CLOUD';
  }

  private localStore(): DraftStore {
    const store = this.store();
    if (!store) throw new Error('本地项目存储不可用');
    return store;
  }
}
