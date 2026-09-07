import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(
  new URL('../src/renderer/src/annotation-workspace/AnnotationWorkspace.tsx', import.meta.url),
  'utf8',
);
const elementEditorSource = readFileSync(
  new URL('../src/renderer/src/annotation-workspace/useElementCommentEditor.ts', import.meta.url),
  'utf8',
);
const captureEditorSource = readFileSync(
  new URL('../src/renderer/src/annotation-workspace/useCaptureEditor.ts', import.meta.url),
  'utf8',
);
const rendererSource = readFileSync(
  new URL('../src/renderer/src/main.tsx', import.meta.url),
  'utf8',
);

describe('desktop toast policy', () => {
  it('uses the page loading state instead of a duplicate project-switch toast', () => {
    expect(workspaceSource).not.toContain('正在切换到 ${project.title}');
  });

  it('keeps routine context changes silent', () => {
    for (const message of [
      '调试证据已引用到当前元素批注。',
      '调试证据已引用到当前截图批注。',
      '已创建调试标注。',
      '调试标注已删除。',
      '该网站已存在，已切换到原项目。',
      '已恢复标注上下文，可继续编辑。',
    ]) {
      expect(workspaceSource).not.toContain(message);
    }
    expect(elementEditorSource).not.toContain('已加载这个元素的批注。');
  });

  it('keeps frequent annotation saves silent while reporting failures', () => {
    expect(elementEditorSource).not.toContain('元素批注已保存到本机。');
    expect(elementEditorSource).not.toContain('元素批注已更新。');
    expect(elementEditorSource).toContain('无法保存元素批注。');
    expect(captureEditorSource).not.toContain('截图批注已保存到本机。');
    expect(captureEditorSource).toContain('无法保存截图批注。');
  });

  it('deduplicates identical active messages', () => {
    expect(workspaceSource).toContain('toast(message, { id: message })');
  });

  it('positions workspace toasts below the browser toolbar', () => {
    expect(rendererSource).toContain('offset={view ? 14 : { top: 68 }}');
  });
});
