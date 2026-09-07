const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const captureClipboardRepresentations = (
  image: Uint8Array,
  note: string,
): Array<Record<string, string | Blob>> => {
  const imageBuffer = new ArrayBuffer(image.byteLength);
  new Uint8Array(imageBuffer).set(image);

  const representations: Array<Record<string, string | Blob>> = [
    { 'image/png': new Blob([imageBuffer], { type: 'image/png' }) },
  ];
  const normalizedNote = note.trim().slice(0, 2000);
  if (!normalizedNote) return representations;
  representations.push({
    'text/plain': normalizedNote,
    'text/html': `<p>${escapeHtml(normalizedNote)}</p>`,
  });
  return representations;
};
