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
  type: z.enum(['click', 'input', 'select', 'scroll', 'drag', 'navigation', 'wait', 'manual']),
  description: z.string().min(1).max(2000),
  timestampMs: z.number().int().nonnegative(),
  runtimeId: z.uuid().optional(),
  pageRevision: z.uuid().optional(),
  anchor: anchorSchema.optional(),
  endAnchor: anchorSchema.optional(),
  metadata: z
    .object({
      mouseButton: z.number().int().min(0).max(4).optional(),
      valueLength: z.number().int().nonnegative().optional(),
      inputKind: z.string().max(40).optional(),
      selectedCount: z.number().int().nonnegative().optional(),
      scrollXCssPx: z.number().finite().optional(),
      scrollYCssPx: z.number().finite().optional(),
      url: z.url().optional(),
    })
    .optional(),
});

export const recorderEventSchema = z.object({
  protocolVersion: z.literal(1),
  runtimeId: z.uuid(),
  pageRevision: z.uuid(),
  type: z.enum(['click', 'input', 'select', 'scroll', 'drag', 'navigation']),
  timestampMs: z.number().int().nonnegative(),
  elementName: z.string().max(120).optional(),
  mouseButton: z.number().int().min(0).max(4).optional(),
  valueLength: z.number().int().nonnegative().optional(),
  inputKind: z.string().max(40).optional(),
  selectedCount: z.number().int().nonnegative().optional(),
  scrollXCssPx: z.number().finite().optional(),
  scrollYCssPx: z.number().finite().optional(),
  url: z.url().optional(),
  anchor: anchorSchema.optional(),
  endAnchor: anchorSchema.optional(),
});

export const captureRequestSchema = z.object({
  mode: z.enum(['visible', 'element', 'full-page']),
  anchor: anchorSchema.optional(),
});

export const captureContextSchema = z.object({
  mode: z.enum(['visible', 'element', 'full-page']),
  imageWidthPx: z.number().int().positive(),
  imageHeightPx: z.number().int().positive(),
  widthCssPx: z.number().positive(),
  heightCssPx: z.number().positive(),
  originCssPx: pointSchema,
  captureScale: z.number().positive(),
  truncated: z.boolean().default(false),
  warning: z.string().max(500).optional(),
});

export const captureBundleSchema = z.object({
  schemaVersion: z.literal(1),
  page: pageSnapshotSchema,
  anchor: anchorSchema,
  annotations: z.array(annotationSchema).max(500),
  reproduction: z.array(reproductionStepSchema).max(500),
  capture: captureContextSchema.optional(),
});

export const createReportSchema = z.object({
  projectId: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(20_000),
  priority: z.enum(reportPriorities).default('MEDIUM'),
  captureBundle: captureBundleSchema,
  screenshotDataUrl: z.string().startsWith('data:image/png;base64,'),
});

export const userSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1).max(120),
});

export const membershipSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'REPORTER']),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  user: userSummarySchema,
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const projectSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string().min(1).max(120),
  baseUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const webUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Only HTTP and HTTPS URLs are supported');

export const environmentSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string().min(1).max(120),
  baseUrl: webUrlSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createEnvironmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: webUrlSchema,
});

export const updateEnvironmentSchema = createEnvironmentSchema
  .partial()
  .refine(
    (update) => update.name !== undefined || update.baseUrl !== undefined,
    'At least one environment field is required',
  );

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: z.union([z.url(), z.literal('')]).optional(),
});

export const updateProjectSchema = createProjectSchema
  .partial()
  .refine(
    (update) => update.name !== undefined || update.baseUrl !== undefined,
    'At least one project field is required',
  );

export const workspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'REPORTER']),
  projects: z.array(projectSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const reportSchema = createReportSchema.omit({ screenshotDataUrl: true }).extend({
  id: z.uuid(),
  status: z.enum(reportStatuses),
  version: z.number().int().positive(),
  screenshotUrl: z.string(),
  assignee: userSummarySchema.nullable().optional(),
  reporter: userSummarySchema.nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const commentSchema = z.object({
  id: z.uuid(),
  reportId: z.uuid(),
  authorName: z.string().min(1).max(120),
  author: userSummarySchema.nullable().optional(),
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

export const clientPolicySchema = z.object({
  minimumVersion: z.string(),
  recommendedVersion: z.string(),
  currentVersion: z.string(),
  status: z.enum(['supported', 'upgrade-recommended', 'upgrade-required']),
  downloadUrl: z.url().optional(),
  features: z.record(z.string(), z.boolean()),
});

export const ipcChannels = {
  authStatus: 'auth:status',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  navigate: 'browser:navigate',
  goBack: 'browser:back',
  goForward: 'browser:forward',
  reload: 'browser:reload',
  setMode: 'annotation:set-mode',
  capture: 'capture:visible',
  saveDraft: 'draft:save',
  loadDraft: 'draft:load',
  clearDraft: 'draft:clear',
  loadSyncStatus: 'sync:load-status',
  submitReport: 'report:submit',
  browserState: 'browser:state',
  selection: 'inspector:selection',
  region: 'annotation:region',
  recorderEvent: 'recorder:event',
  annotationCreated: 'annotation:created',
  anchorRecovery: 'anchor:recovery',
  syncAnnotations: 'annotation:sync',
  syncAnchor: 'anchor:sync',
  setAnnotationTool: 'annotation:set-tool',
  setRecording: 'recorder:set-recording',
  syncStatus: 'sync:status',
} as const;

export const browserModeSchema = z.enum(['browse', 'inspect', 'region', 'draw']);
export const annotationToolSchema = z.enum(['pin', 'rectangle', 'arrow', 'text', 'pen']);
export const navigateInputSchema = z.object({ url: z.string().min(1).max(4096) });

export type Anchor = z.infer<typeof anchorSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type AnnotationTool = z.infer<typeof annotationToolSchema>;
export type BrowserMode = z.infer<typeof browserModeSchema>;
export type CaptureBundle = z.infer<typeof captureBundleSchema>;
export type CaptureContext = z.infer<typeof captureContextSchema>;
export type CaptureRequest = z.infer<typeof captureRequestSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type ClientPolicy = z.infer<typeof clientPolicySchema>;
export type CreateEnvironment = z.infer<typeof createEnvironmentSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
export type CreateReport = z.infer<typeof createReportSchema>;
export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;
export type ElementAnchor = z.infer<typeof elementAnchorSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type Project = z.infer<typeof projectSchema>;
export type RegionAnchor = z.infer<typeof regionAnchorSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ReportStatus = (typeof reportStatuses)[number];
export type RecorderEvent = z.infer<typeof recorderEventSchema>;
export type ReproductionStep = z.infer<typeof reproductionStepSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
export type UpdateEnvironment = z.infer<typeof updateEnvironmentSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
