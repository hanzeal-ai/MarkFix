import { z } from 'zod';

export const reportStatuses = [
  'OPEN',
  'IN_PROGRESS',
  'READY_FOR_VERIFY',
  'RESOLVED',
  'CLOSED',
  'FIX_FAILED',
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

const runtimeDomNodeSchema = z.object({
  tagName: z.string().min(1).max(100),
  selectorSegment: z.string().min(1).max(512),
  attributes: z.record(z.string().max(100), z.string().max(500)).default({}),
});

const runtimeScriptSchema = z.object({
  url: z.string().max(4096),
  sourceMapUrl: z.string().max(4096).optional(),
  hash: z.string().max(256).optional(),
});

const runtimeComponentHintSchema = z.object({
  framework: z.enum(['react', 'vue', 'angular', 'unknown']),
  name: z.string().max(300).optional(),
  sourceFile: z.string().max(4096).optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().nonnegative().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const elementRuntimeEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  selectorCandidates: z.array(z.string().min(1).max(2048)).max(20).default([]),
  classNames: z.array(z.string().min(1).max(200)).max(50).default([]),
  accessibleName: z.string().max(500).optional(),
  sanitizedOuterHtml: z.string().max(8000).optional(),
  ancestorPath: z.array(runtimeDomNodeSchema).max(12).default([]),
  nearbyText: z.array(z.string().max(500)).max(10).default([]),
  componentHint: runtimeComponentHintSchema.optional(),
  pageBuild: z.object({
    scripts: z.array(runtimeScriptSchema).max(200).default([]),
    stylesheets: z.array(z.string().max(4096)).max(100).default([]),
    sourceMapHints: z.array(z.string().max(4096)).max(200).default([]),
    metadata: z.record(z.string().max(100), z.string().max(1000)).default({}),
    frameworkHints: z.array(z.string().max(100)).max(20).default([]),
    buildId: z.string().max(500).optional(),
  }),
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
  runtimeEvidence: elementRuntimeEvidenceSchema,
});

export const regionAnchorSchema = z.object({
  kind: z.literal('region'),
  xCssPx: z.number().nonnegative(),
  yCssPx: z.number().nonnegative(),
  widthCssPx: z.number().positive(),
  heightCssPx: z.number().positive(),
  documentUrl: z.url(),
  scrollXCssPx: z.number().finite(),
  scrollYCssPx: z.number().finite(),
});

export const anchorSchema = z.discriminatedUnion('kind', [elementAnchorSchema, regionAnchorSchema]);

export const captureRequestSchema = z.object({
  mode: z.enum(['visible', 'element', 'region', 'full-page']),
  anchor: anchorSchema.optional(),
});

export const captureContextSchema = z.object({
  mode: z.enum(['visible', 'element', 'region', 'full-page']),
  imageWidthPx: z.number().int().positive(),
  imageHeightPx: z.number().int().positive(),
  widthCssPx: z.number().positive(),
  heightCssPx: z.number().positive(),
  originCssPx: pointSchema,
  captureScale: z.number().positive(),
  truncated: z.boolean().default(false),
  warning: z.string().max(500).optional(),
});

export const screenshotToolSchema = z.enum([
  'select',
  'rectangle',
  'ellipse',
  'arrow',
  'pen',
  'text',
  'mosaic',
  'number',
]);
export const screenshotStyleSchema = z.object({
  color: z.string().min(1).max(32),
  strokeWidth: z.union([z.literal(2), z.literal(4), z.literal(6)]),
});

const screenshotMarkBaseSchema = z.object({
  id: z.uuid(),
  color: z.string().min(1).max(32),
  strokeWidth: z.union([z.literal(2), z.literal(4), z.literal(6)]),
});

const screenshotBoundsMarkSchema = screenshotMarkBaseSchema.extend({
  type: z.enum(['rectangle', 'ellipse', 'mosaic']),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const screenshotMarkSchema = z.discriminatedUnion('type', [
  screenshotBoundsMarkSchema.extend({ type: z.literal('rectangle') }),
  screenshotBoundsMarkSchema.extend({ type: z.literal('ellipse') }),
  screenshotBoundsMarkSchema.extend({ type: z.literal('mosaic') }),
  screenshotMarkBaseSchema.extend({
    type: z.literal('arrow'),
    start: pointSchema,
    end: pointSchema,
  }),
  screenshotMarkBaseSchema.extend({
    type: z.literal('pen'),
    points: z.array(pointSchema).min(2).max(5000),
  }),
  screenshotMarkBaseSchema.extend({
    type: z.literal('text'),
    position: pointSchema,
    text: z.string().max(200),
  }),
  screenshotMarkBaseSchema.extend({
    type: z.literal('number'),
    position: pointSchema,
    label: z.number().int().positive().max(999),
  }),
]);

const diagnosticBodyStateSchema = z.enum([
  'captured',
  'empty',
  'truncated',
  'unavailable',
  'omitted',
]);
const diagnosticHeadersSchema = z.record(z.string().max(200), z.string().max(2000));

export const diagnosticEvidenceSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['console', 'exception', 'network', 'command', 'system']),
  level: z.enum(['info', 'warning', 'error']),
  timestamp: z.iso.datetime(),
  pageUrl: z.string().max(4096),
  pageRevision: z.uuid().optional(),
  title: z.string().min(1).max(500),
  message: z.string().max(20_000),
  source: z.string().max(4096).optional(),
  stack: z.string().max(20_000).optional(),
  arguments: z.array(z.string().max(20_000)).max(50).optional(),
  captureNotes: z.array(z.string().max(500)).max(50).optional(),
  response: z
    .object({
      headers: diagnosticHeadersSchema.optional(),
      body: z.string().max(20_000).optional(),
      bodyState: diagnosticBodyStateSchema.optional(),
      mimeType: z.string().max(200).optional(),
    })
    .optional(),
  request: z
    .object({
      headers: diagnosticHeadersSchema.optional(),
      body: z.string().max(20_000).optional(),
      bodyState: diagnosticBodyStateSchema.optional(),
      requestId: z.string().max(500).optional(),
      method: z.string().min(1).max(32),
      url: z.string().max(4096),
      status: z.number().int().min(0).max(999).optional(),
      statusText: z.string().max(500).optional(),
      resourceType: z.string().max(100).optional(),
      durationMs: z.number().nonnegative().optional(),
    })
    .optional(),
  command: z
    .object({
      mode: z.enum(['javascript', 'curl']),
      input: z.string().min(1).max(20_000),
      output: z.string().max(65_536),
    })
    .optional(),
  redactions: z.array(z.string().max(200)).max(50).default([]),
});

export const annotationRecordStatusSchema = z.enum(['draft', 'submitted', 'rejected']);
export type AnnotationHistorySummary = {
  projectId: string;
  total: number;
  draft: number;
  submitted: number;
  rejected: number;
  updatedAt: string;
};

const annotationRecordContextSchema = z.object({
  projectId: z.uuid(),
  pageSessionId: z.uuid(),
  pageTitle: z.string().max(500),
  status: annotationRecordStatusSchema,
  rejectionReason: z.string().max(2000).optional(),
  submittedAt: z.iso.datetime().optional(),
});

export const savedCaptureSchema = annotationRecordContextSchema.extend({
  id: z.uuid(),
  pageUrl: z.url(),
  note: z.string().min(1).max(2000),
  dataUrl: z.string().startsWith('data:image/png;base64,'),
  widthCssPx: z.number().positive(),
  heightCssPx: z.number().positive(),
  marks: z.array(screenshotMarkSchema).max(500),
  selection: regionAnchorSchema,
  sourceDataUrl: z.string().startsWith('data:image/png;base64,'),
  captureScale: z.number().positive(),
  page: pageSnapshotSchema,
  capture: captureContextSchema,
  evidence: z.array(diagnosticEvidenceSchema).max(50).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const savedElementCommentSchema = annotationRecordContextSchema.extend({
  id: z.uuid(),
  pageUrl: z.url(),
  anchor: elementAnchorSchema,
  note: z.string().min(1).max(2000),
  screenshotDataUrl: z.string().startsWith('data:image/png;base64,').optional(),
  capture: captureContextSchema.optional(),
  evidence: z.array(diagnosticEvidenceSchema).max(50).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const savedDiagnosticAnnotationSchema = annotationRecordContextSchema.extend({
  id: z.uuid(),
  pageUrl: z.url(),
  evidence: diagnosticEvidenceSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const historyAnnotationReferenceSchema = z.object({
  type: z.enum(['element', 'capture', 'diagnostic']),
  projectId: z.uuid(),
  id: z.uuid(),
});

export const annotationSubmissionSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    elementComments: z.array(savedElementCommentSchema).max(500),
    captures: z.array(savedCaptureSchema).max(500),
    diagnostics: z.array(savedDiagnosticAnnotationSchema).max(500),
    submittedAt: z.iso.datetime(),
  })
  .refine(
    ({ elementComments, captures, diagnostics }) =>
      elementComments.length + captures.length + diagnostics.length > 0,
    'At least one annotation is required',
  );

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

export const captureBundleSchema = z.strictObject({
  schemaVersion: z.literal(2),
  page: pageSnapshotSchema,
  anchor: anchorSchema.optional(),
  annotationKind: z.enum(['ELEMENT', 'SCREENSHOT', 'COMMENT']),
  sourceAnnotationId: z.uuid().optional(),
  evidence: z.array(diagnosticEvidenceSchema).max(50).optional(),
  reproduction: z.array(reproductionStepSchema).max(500),
  capture: captureContextSchema.optional(),
});

export const createReportSchema = z.object({
  projectId: z.uuid(),
  environmentId: z.uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(20_000),
  priority: z.enum(reportPriorities).default('MEDIUM'),
  captureBundle: captureBundleSchema,
  screenshotDataUrl: z.string().startsWith('data:image/png;base64,').optional(),
});

export const userSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1).max(120),
});

export const projectRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'REPORTER']);
export type ProjectRole = z.infer<typeof projectRoleSchema>;
export const membershipSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  role: projectRoleSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  user: userSummarySchema,
});

export const projectSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  role: projectRoleSchema.optional(),
  name: z.string().min(1).max(120),
  baseUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const webUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Only HTTP and HTTPS URLs are supported');

const websiteProjectBaseSchema = z.object({
  repositoryId: z.uuid().nullable().optional(),
  repositoryName: z.string().trim().min(1).max(120).nullable().optional(),
  id: z.uuid(),
  title: z.string().min(1).max(120),
  origin: webUrlSchema,
  entryUrl: webUrlSchema,
  faviconUrl: z.string().max(4096).nullable(),
  faviconSource: z.enum(['page', 'apple-touch-icon', 'root', 'markfix']),
  currentPageSessionId: z.uuid(),
  currentUrl: webUrlSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const projectStorageModeSchema = z.enum(['LOCAL', 'CLOUD']);

export const websiteProjectSchema = z.discriminatedUnion('storageMode', [
  websiteProjectBaseSchema
    .extend({
      storageMode: z.literal('LOCAL'),
    })
    .strict(),
  websiteProjectBaseSchema
    .extend({
      storageMode: z.literal('CLOUD'),
    })
    .strict(),
]);

export const cloudProjectStateSchema = z.strictObject({
  project: websiteProjectBaseSchema
    .extend({
      storageMode: z.literal('CLOUD'),
    })
    .strict(),
  navigation: z.strictObject({
    entries: z
      .array(
        z.strictObject({
          pageSessionId: z.uuid(),
          url: webUrlSchema,
          title: z.string().max(500),
        }),
      )
      .max(200),
    currentIndex: z.number().int().min(-1),
  }),
  revision: z.number().int().nonnegative(),
});

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

export const reportSchema = createReportSchema.omit({ screenshotDataUrl: true }).extend({
  id: z.uuid(),
  environmentId: z.uuid().nullable(),
  environment: environmentSchema.nullable().optional(),
  status: z.enum(reportStatuses),
  rejectionReason: z.string().max(2000).nullable().optional(),
  version: z.number().int().positive(),
  screenshotUrl: z.string().optional(),
  fixAttempts: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        summary: z.string().nullable(),
        reason: z.string().nullable(),
        stage: z.string().nullable(),
        evidence: z.unknown(),
        createdAt: z.iso.datetime(),
        finishedAt: z.iso.datetime().nullable(),
      }),
    )
    .optional(),
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
  enterLocalMode: 'auth:enter-local',
  authRegister: 'auth:register',
  authLogin: 'auth:login',
  authChangePassword: 'auth:change-password',
  authLogout: 'auth:logout',
  desktopBootstrap: 'desktop:bootstrap',
  listEnvironments: 'environment:list',
  getProjectAgentData: 'project-agent:get',
  setProjectRepository: 'project-agent:bind',
  listWebsiteProjects: 'website-project:list',
  listProjectAnnotationReports: 'project-annotation-reports:list',
  createWebsiteProject: 'website-project:create',
  switchWebsiteProject: 'website-project:switch',
  deleteWebsiteProject: 'website-project:delete',
  confirmDiscardDraft: 'desktop-dialog:confirm-discard-draft',
  setWorkspaceLayout: 'workspace-layout:set',
  openSettings: 'settings:open',
  navigate: 'browser:navigate',
  goBack: 'browser:back',
  goForward: 'browser:forward',
  reload: 'browser:reload',
  setMode: 'annotation:set-mode',
  capture: 'capture:visible',
  loadSyncStatus: 'sync:load-status',
  submitReport: 'report:submit',
  browserState: 'browser:state',
  selection: 'inspector:selection',
  anchorRecovery: 'anchor:recovery',
  syncAnchor: 'anchor:sync',
  captureSelection: 'capture:selection',
  captureMarksChanged: 'capture:marks-changed',
  setCaptureTool: 'capture:set-tool',
  setCaptureStyle: 'capture:set-style',
  syncCaptureMarks: 'capture:sync-marks',
  clearCaptureSelection: 'capture:clear-selection',
  restoreCaptureSelection: 'capture:restore-selection',
  copyCaptureImage: 'capture:copy-image',
  saveCaptureImage: 'capture:save-image',
  captureAction: 'capture:action',
  listCaptureRecords: 'capture-record:list',
  listAnnotationHistorySummaries: 'annotation-history-summary:list',
  saveCaptureRecord: 'capture-record:save',
  deleteCaptureRecord: 'capture-record:delete',
  listElementComments: 'element-comment:list',
  saveElementComment: 'element-comment:save',
  deleteElementComment: 'element-comment:delete',
  syncElementComments: 'element-comment:sync',
  listDiagnosticAnnotations: 'diagnostic-annotation:list',
  saveDiagnosticAnnotation: 'diagnostic-annotation:save',
  deleteDiagnosticAnnotation: 'diagnostic-annotation:delete',
  saveAnnotationSubmission: 'annotation-submission:save',
  openAnnotationReview: 'annotation-review:open',
  closeAnnotationReview: 'annotation-review:close',
  openAnnotationHistory: 'annotation-history:open',
  openProjectAnnotationHistory: 'annotation-history:open-project',
  selectAnnotationHistory: 'annotation-history:select',
  annotationHistorySelected: 'annotation-history:selected',
  openCapturePreview: 'capture-preview:open',
  loadCapturePreview: 'capture-preview:load',
  annotationSubmissionSaved: 'annotation-submission:saved',
  modeShortcut: 'annotation:mode-shortcut',
  diagnosticsSetOpen: 'diagnostics:set-open',
  diagnosticsList: 'diagnostics:list',
  diagnosticsClear: 'diagnostics:clear',
  diagnosticsEvaluate: 'diagnostics:evaluate',
  diagnosticsRunCurl: 'diagnostics:run-curl',
  diagnosticsEvent: 'diagnostics:event',
  syncStatus: 'sync:status',
} as const;

export const browserModeSchema = z.enum(['browse', 'comment', 'capture']);
export const navigateInputSchema = z.object({ url: z.string().min(1).max(4096) });

export type Anchor = z.infer<typeof anchorSchema>;
export type ScreenshotTool = z.infer<typeof screenshotToolSchema>;
export type ScreenshotMark = z.infer<typeof screenshotMarkSchema>;
export type ScreenshotStyle = z.infer<typeof screenshotStyleSchema>;
export type SavedCapture = z.infer<typeof savedCaptureSchema>;
export type SavedElementComment = z.infer<typeof savedElementCommentSchema>;
export type SavedDiagnosticAnnotation = z.infer<typeof savedDiagnosticAnnotationSchema>;
export type HistoryAnnotationReference = z.infer<typeof historyAnnotationReferenceSchema>;
export type AnnotationRecordStatus = z.infer<typeof annotationRecordStatusSchema>;
export type DiagnosticEvidence = z.infer<typeof diagnosticEvidenceSchema>;
export type AnnotationSubmission = z.infer<typeof annotationSubmissionSchema>;
export type BrowserMode = z.infer<typeof browserModeSchema>;
export type CaptureBundle = z.infer<typeof captureBundleSchema>;
export type CaptureContext = z.infer<typeof captureContextSchema>;
export type CaptureRequest = z.infer<typeof captureRequestSchema>;
export type CloudProjectState = z.infer<typeof cloudProjectStateSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type ClientPolicy = z.infer<typeof clientPolicySchema>;
export type CreateEnvironment = z.infer<typeof createEnvironmentSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
export type CreateReport = z.infer<typeof createReportSchema>;
export type ElementAnchor = z.infer<typeof elementAnchorSchema>;
export type ElementRuntimeEvidence = z.infer<typeof elementRuntimeEvidenceSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type PageSnapshot = z.infer<typeof pageSnapshotSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectStorageMode = z.infer<typeof projectStorageModeSchema>;
export type RegionAnchor = z.infer<typeof regionAnchorSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ReportStatus = (typeof reportStatuses)[number];
export type ReproductionStep = z.infer<typeof reproductionStepSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
export type UpdateEnvironment = z.infer<typeof updateEnvironmentSchema>;
export type WebsiteProject = z.infer<typeof websiteProjectSchema>;

export * from './commercial.js';

export * from './agent.js';

export * from './service-config.js';

export { diagnosticEvidenceSections } from './diagnostic-display.js';
