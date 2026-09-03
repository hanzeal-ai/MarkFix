import { z } from 'zod';

export const reportStatuses = [
  'OPEN',
  'IN_PROGRESS',
  'READY_FOR_VERIFY',
  'RESOLVED',
  'CLOSED',
] as const;

export const reportPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const pageSnapshotSchema = z.object({
  url: z.url(),
  title: z.string().max(500),
  viewportWidthCssPx: z.number().positive(),
  viewportHeightCssPx: z.number().positive(),
  deviceScaleFactor: z.number().positive(),
  capturedAt: z.iso.datetime(),
});

export const elementAnchorSchema = z.object({
  kind: z.literal('element'),
  cssSelector: z.string().min(1).max(2048),
  textQuote: z.string().max(500),
  tagName: z.string().min(1).max(100),
  attributes: z.record(z.string(), z.string()).default({}),
  documentUrl: z.url(),
  framePath: z.array(z.string()).default([]),
  quadsCssPx: z.array(z.array(z.number()).length(8)).min(1),
});

export const regionAnchorSchema = z.object({
  kind: z.literal('region'),
  xCssPx: z.number().nonnegative(),
  yCssPx: z.number().nonnegative(),
  widthCssPx: z.number().positive(),
  heightCssPx: z.number().positive(),
  documentUrl: z.url(),
});

export const anchorSchema = z.discriminatedUnion('kind', [elementAnchorSchema, regionAnchorSchema]);

const annotationBaseSchema = z.object({
  id: z.uuid(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  createdAt: z.iso.datetime(),
});

export const annotationSchema = z.discriminatedUnion('type', [
  annotationBaseSchema.extend({
    type: z.literal('pin'),
    position: pointSchema,
    label: z.number().int().positive(),
  }),
  annotationBaseSchema.extend({
    type: z.literal('rectangle'),
    start: pointSchema,
    end: pointSchema,
  }),
  annotationBaseSchema.extend({ type: z.literal('arrow'), start: pointSchema, end: pointSchema }),
  annotationBaseSchema.extend({
    type: z.literal('text'),
    position: pointSchema,
    text: z.string().min(1).max(2000),
  }),
  annotationBaseSchema.extend({
    type: z.literal('pen'),
    points: z.array(pointSchema).min(2).max(5000),
  }),
]);

export const reproductionStepSchema = z.object({
  id: z.uuid(),
  type: z.enum(['click', 'input', 'scroll', 'navigation', 'manual']),
  description: z.string().min(1).max(2000),
  timestampMs: z.number().int().nonnegative(),
  anchor: anchorSchema.optional(),
});

export const captureBundleSchema = z.object({
  schemaVersion: z.literal(1),
  page: pageSnapshotSchema,
  anchor: anchorSchema,
  annotations: z.array(annotationSchema).max(500),
  reproduction: z.array(reproductionStepSchema).max(500),
});

export const createReportSchema = z.object({
  projectId: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(20_000),
  priority: z.enum(reportPriorities).default('MEDIUM'),
  captureBundle: captureBundleSchema,
  screenshotDataUrl: z.string().startsWith('data:image/png;base64,'),
});

export const reportSchema = createReportSchema.omit({ screenshotDataUrl: true }).extend({
  id: z.uuid(),
  status: z.enum(reportStatuses),
  version: z.number().int().positive(),
  screenshotUrl: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const commentSchema = z.object({
  id: z.uuid(),
  reportId: z.uuid(),
  authorName: z.string().min(1).max(120),
  body: z.string().min(1).max(5000),
  createdAt: z.iso.datetime(),
});

export const transitionSchema = z.object({
  action: z.enum(['start', 'submit_for_verification', 'verify', 'reject', 'close', 'reopen']),
  reason: z.string().max(2000).optional(),
  resolutionSummary: z.string().max(5000).optional(),
  expectedVersion: z.number().int().positive(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

export const ipcChannels = {
  navigate: 'browser:navigate',
  goBack: 'browser:back',
  goForward: 'browser:forward',
  reload: 'browser:reload',
  setMode: 'annotation:set-mode',
  capture: 'capture:visible',
  saveDraft: 'draft:save',
  loadDraft: 'draft:load',
  submitReport: 'report:submit',
  browserState: 'browser:state',
  selection: 'inspector:selection',
  region: 'annotation:region',
  recorderEvent: 'recorder:event',
} as const;

export const browserModeSchema = z.enum(['browse', 'inspect', 'region', 'draw']);
export const navigateInputSchema = z.object({ url: z.string().min(1).max(4096) });

export type Anchor = z.infer<typeof anchorSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type BrowserMode = z.infer<typeof browserModeSchema>;
export type CaptureBundle = z.infer<typeof captureBundleSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type CreateReport = z.infer<typeof createReportSchema>;
export type ElementAnchor = z.infer<typeof elementAnchorSchema>;
export type RegionAnchor = z.infer<typeof regionAnchorSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ReportStatus = (typeof reportStatuses)[number];
export type ReproductionStep = z.infer<typeof reproductionStepSchema>;
