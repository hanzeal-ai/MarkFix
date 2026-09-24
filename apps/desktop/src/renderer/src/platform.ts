export const isMac = window.markfix.platform === 'darwin';
export const primaryKey = isMac ? '⌘' : 'Ctrl+';
export const primaryAriaKey = isMac ? 'Meta' : 'Control';
export const altKey = isMac ? '⌥' : 'Alt+';
export const manualUpdates = window.markfix.manualUpdates;
