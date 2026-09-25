import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('assigns a higher stable version to later CI runs without changing dependencies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'markfix-release-version-'));
  try {
    const file = join(dir, 'package.json');
    const base = { version: '0.1.0', dependencies: { test: '1.0.0' } };
    const run = (number: string) => {
      writeFileSync(file, JSON.stringify(base));
      execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL('../scripts/prepare-release-version.mjs', import.meta.url)),
          number,
          file,
        ],
        { stdio: 'pipe' },
      );
      return JSON.parse(readFileSync(file, 'utf8'));
    };
    expect(run('10')).toEqual({ ...base, version: '0.1.10' });
    expect(run('11').version).toBe('0.1.11');
    expect(() => run('0')).toThrow();
    expect(() => run('invalid')).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
