import { describe, expect, it } from 'vitest';
import { captureClipboardRepresentations } from '../src/main/capture-clipboard';

describe('capture clipboard representations', () => {
  it('copies the PNG and note in plain and rich-text formats', () => {
    const representations = captureClipboardRepresentations(new Uint8Array([0]), ' 删除 <档案> ');

    expect(representations).toHaveLength(2);
    expect(representations[0]?.['image/png']).toBeInstanceOf(Blob);
    expect(representations[1]?.['text/plain']).toBe('删除 <档案>');
    expect(representations[1]?.['text/html']).toBe('<p>删除 &lt;档案&gt;</p>');
  });

  it('keeps image-only copies valid before a note is entered', () => {
    const representations = captureClipboardRepresentations(new Uint8Array([0]), ' ');

    expect(representations).toHaveLength(1);
    expect(Object.keys(representations[0] ?? {})).toEqual(['image/png']);
  });
});
