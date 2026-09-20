import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ElementCommentPanel } from '../src/renderer/src/annotation-workspace/ElementCommentPanel';
import { firstAnnotationGuideStep } from '../src/renderer/src/annotation-workspace/FirstAnnotationGuide';

describe('first annotation roaming guide', () => {
  it('follows the main creation steps', () => {
    expect(
      firstAnnotationGuideStep({
        active: true,
        editing: false,
        enabled: true,
        hasDescription: false,
        hasSelection: false,
      }),
    ).toBe('select');
    expect(
      firstAnnotationGuideStep({
        active: true,
        editing: false,
        enabled: true,
        hasDescription: false,
        hasSelection: true,
      }),
    ).toBe('describe');
    expect(
      firstAnnotationGuideStep({
        active: true,
        editing: false,
        enabled: true,
        hasDescription: true,
        hasSelection: true,
      }),
    ).toBe('complete');
  });

  it('stays hidden outside first-time creation', () => {
    const base = {
      active: true,
      editing: false,
      enabled: true,
      hasDescription: false,
      hasSelection: false,
    };

    expect(firstAnnotationGuideStep({ ...base, active: false })).toBeUndefined();
    expect(firstAnnotationGuideStep({ ...base, editing: true })).toBeUndefined();
    expect(firstAnnotationGuideStep({ ...base, enabled: false })).toBeUndefined();
  });

  it('keeps the element locator but omits the selected element text', () => {
    const html = renderToStaticMarkup(
      createElement(ElementCommentPanel, {
        active: true,
        numberOffset: 0,
        anchor: {
          runtimeEvidence: {
            schemaVersion: 1,
            selectorCandidates: [],
            classNames: [],
            ancestorPath: [],
            nearbyText: [],
            pageBuild: {
              scripts: [],
              stylesheets: [],
              sourceMapHints: [],
              metadata: {},
              frameworkHints: [],
            },
          },
          kind: 'element',
          cssSelector: '#welcome-title',
          textQuote: '不应显示的页面文字',
          tagName: 'h1',
          attributes: {},
          documentUrl: 'https://example.com/',
          framePath: [],
          quadsCssPx: [[0, 0, 100, 0, 100, 30, 0, 30]],
        },
        editingElementCommentId: undefined,
        elementCommentNote: '',
        elementEvidence: [],
        pageElementComments: [],
        pageDiagnosticAnnotations: [],
        setElementCommentNote: () => undefined,
        setElementEvidence: () => undefined,
        clearElementSelection: () => undefined,
        completeElementComment: async () => undefined,
        deleteDiagnosticAnnotation: async () => undefined,
        deleteElementComment: async () => undefined,
        selectElementComment: () => undefined,
        guideStep: undefined,
        dismissGuide: () => undefined,
      }),
    );

    expect(html).toContain('#welcome-title');
    expect(html).not.toContain('不应显示的页面文字');
  });
});
