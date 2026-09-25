import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import type { AuthUser, MarkFixApi } from '@markfix/api-client';
import type { ClientPolicy } from '@markfix/contracts';

export class DesktopSessionManager {
  private policyCache: { value: ClientPolicy; checkedAtMs: number } | undefined;

  private credentialWrite: Promise<void> = Promise.resolve();
  private restoring: Promise<AuthUser | undefined> | undefined;

  constructor(private readonly api: MarkFixApi) {}

  private writeCredential(operation: () => Promise<void>): Promise<void> {
    const revision = this.api.sessionRevision;
    const write = this.credentialWrite
      .catch(() => {})
      .then(async () => {
        if (revision === this.api.sessionRevision) await operation();
      });
    this.credentialWrite = write;
    return write;
  }

  async loadPolicy(force = false): Promise<ClientPolicy> {
    if (!force && this.policyCache && Date.now() - this.policyCache.checkedAtMs < 5 * 60 * 1000) {
      return this.policyCache.value;
    }
    const value = await this.api.clientPolicy(app.getVersion(), process.platform, process.arch);
    this.policyCache = { value, checkedAtMs: Date.now() };
    return value;
  }

  assertSupported(policy: ClientPolicy): void {
    if (policy.status === 'upgrade-required') {
      throw new Error(
        `MarkFix ${policy.minimumVersion} or newer is required. Install the latest desktop release.`,
      );
    }
  }

  async saveRefreshToken(refreshToken: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('The operating system credential vault is unavailable');
    }
    await this.writeCredential(() =>
      writeFile(this.credentialPath(), safeStorage.encryptString(refreshToken), {
        mode: 0o600,
      }),
    );
  }

  async clearRefreshToken(): Promise<void> {
    await this.writeCredential(() =>
      unlink(this.credentialPath()).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }),
    );
  }

  async restore(): Promise<AuthUser | undefined> {
    if (this.restoring) return this.restoring;
    const pending = this.restoreCurrent();
    this.restoring = pending;
    try {
      return await pending;
    } finally {
      if (this.restoring === pending) this.restoring = undefined;
    }
  }

  private async restoreCurrent(): Promise<AuthUser | undefined> {
    if (!safeStorage.isEncryptionAvailable()) return undefined;
    let revision = this.api.sessionRevision;
    try {
      await this.credentialWrite.catch(() => {});
      const refreshToken = safeStorage.decryptString(await readFile(this.credentialPath()));
      if (revision !== this.api.sessionRevision) return undefined;
      this.api.setTokens({ accessToken: '', refreshToken });
      revision = this.api.sessionRevision;
      const tokens = await this.api.refreshWithToken();
      if (revision !== this.api.sessionRevision) return undefined;
      await this.saveRefreshToken(tokens.refreshToken);
      if (revision !== this.api.sessionRevision) return undefined;
      const user = await this.api.me();
      return revision === this.api.sessionRevision ? user : undefined;
    } catch {
      if (revision !== this.api.sessionRevision) return undefined;
      this.api.setTokens();
      await this.clearRefreshToken();
      return undefined;
    }
  }

  private credentialPath(): string {
    return join(app.getPath('userData'), 'refresh-token.secure');
  }
}
