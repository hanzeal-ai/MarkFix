import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import type { MarkFixApi } from '@markfix/api-client';
import type { ClientPolicy } from '@markfix/contracts';

export class DesktopSessionManager {
  private policyCache: { value: ClientPolicy; checkedAtMs: number } | undefined;

  constructor(private readonly api: MarkFixApi) {}

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
    await writeFile(this.credentialPath(), safeStorage.encryptString(refreshToken), {
      mode: 0o600,
    });
  }

  async clearRefreshToken(): Promise<void> {
    await unlink(this.credentialPath()).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }

  async restore() {
    if (!safeStorage.isEncryptionAvailable()) return undefined;
    try {
      const refreshToken = safeStorage.decryptString(await readFile(this.credentialPath()));
      this.api.setTokens({ accessToken: '', refreshToken });
      const tokens = await this.api.refreshWithToken();
      this.api.setTokens(tokens);
      await this.saveRefreshToken(tokens.refreshToken);
      return await this.api.me();
    } catch {
      this.api.setTokens();
      await this.clearRefreshToken();
      return undefined;
    }
  }

  private credentialPath(): string {
    return join(app.getPath('userData'), 'refresh-token.secure');
  }
}
