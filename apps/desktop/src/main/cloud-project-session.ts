import { MarkFixApiError, type MarkFixApi } from '@markfix/api-client';
import type { CloudProjectState, WebsiteProject } from '@markfix/contracts';

/** Owns cloud state and pending saves for one authenticated desktop session. */
export class CloudProjectSession {
  private readonly states = new Map<string, CloudProjectState>();
  private readonly queues = new Map<string, Promise<void>>();
  private generation = 0;

  constructor(
    private readonly api: Pick<MarkFixApi, 'saveCloudProjectState' | 'getCloudProjectState'>,
    private readonly updated: (project: WebsiteProject) => void,
    private readonly failed: (projectId: string, message: string) => void,
  ) {}

  get revision(): number {
    return this.generation;
  }
  get(id: string): CloudProjectState | undefined {
    return this.states.get(id);
  }
  set(id: string, state: CloudProjectState): void {
    this.states.set(id, state);
  }
  delete(id: string): void {
    this.states.delete(id);
    this.queues.delete(id);
  }
  clear(): void {
    this.generation++;
    this.states.clear();
    this.queues.clear();
  }

  save(projectId: string): Promise<void> {
    const generation = this.generation;
    const previous = this.queues.get(projectId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.generation) return;
        const snapshot = this.states.get(projectId);
        if (!snapshot) return;
        let saved: CloudProjectState;
        try {
          saved = await this.api.saveCloudProjectState(snapshot);
        } catch (error) {
          if (!(error instanceof MarkFixApiError) || error.status !== 409) throw error;
          if (generation !== this.generation || !this.states.has(projectId)) return;
          const remote = await this.api.getCloudProjectState(projectId);
          if (!remote) throw error;
          if (generation !== this.generation) return;
          const desired = this.states.get(projectId);
          if (!desired) return;
          if (remote.project.updatedAt > desired.project.updatedAt) {
            this.states.set(projectId, remote);
            this.updated(remote.project);
            return;
          }
          saved = await this.api.saveCloudProjectState({ ...desired, revision: remote.revision });
        }
        if (generation !== this.generation) return;
        const desired = this.states.get(projectId);
        if (!desired) return;
        if (desired === snapshot) {
          this.states.set(projectId, saved);
          this.updated(saved.project);
        } else {
          this.states.set(projectId, { ...desired, revision: saved.revision });
        }
      })
      .catch((error: unknown) => {
        if (generation !== this.generation || !this.states.has(projectId)) return;
        this.failed(projectId, error instanceof Error ? error.message : '云端项目状态保存失败');
      });
    this.queues.set(projectId, next);
    return next;
  }
}
