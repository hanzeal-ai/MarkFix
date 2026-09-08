export const sidebarMinWidth = 200;
export const sidebarMaxWidth = 400;
export const sidebarCollapseWidth = 160;

export const isSidebarWidth = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  (value === 0 || (value >= sidebarMinWidth && value <= sidebarMaxWidth));
