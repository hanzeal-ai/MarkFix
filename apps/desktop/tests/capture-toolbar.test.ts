import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('capture toolbar actions', () => {
  it('does not render the redundant finish button', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/target-runtime/index.ts', import.meta.url)),
      'utf8',
    );

    expect(source).not.toContain("'完成截图'");
    expect(source).not.toContain("'markfix:capture-action', 'finish'");
    expect(source).toContain("'markfix:capture-action', 'copy'");
    expect(source).toContain("'markfix:capture-action', 'save'");
  });
});
