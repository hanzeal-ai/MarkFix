export const sidebarMinWidth = 200;
export const sidebarMaxWidth = 400;
export const annotationPanelDefaultWidth = 360;
export const websiteMinWidth = 320;

export const annotationPanelWidth = (requested: number, left: number, viewport: number): number =>
  Math.max(0, Math.min(requested, viewport - left - websiteMinWidth));

export const isSidebarWidth = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  (value === 0 || (value >= sidebarMinWidth && value <= sidebarMaxWidth));
