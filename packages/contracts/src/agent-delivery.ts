import { z } from 'zod';

const deliveryIssueSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  environmentId: z.uuid().nullable(),
  reporterId: z.uuid().nullable(),
  assigneeId: z.uuid().nullable(),
  title: z.string().min(1),
  description: z.string().min(1),
  status: z.string().min(1),
  priority: z.string().min(1),
  captureBundle: z
    .object({
      schemaVersion: z.literal(1),
      sourceAnnotationId: z.uuid().optional(),
      annotationKind: z.enum(['ELEMENT', 'SCREENSHOT', 'COMMENT']),
      page: z.object({ url: z.url(), capturedAt: z.iso.datetime() }).passthrough(),
      annotations: z.array(z.unknown()),
      reproduction: z.array(z.unknown()),
    })
    .passthrough(),
  screenshotPath: z.string().nullable().optional(),
  screenshotUrl: z.string().nullable().optional(),
  screenshotSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional(),
});

export type AgentIssueDelivery = {
  groups: { primaryId: string; memberIds: string[]; reason: 'individual' | 'identical-evidence' }[];
  relatedPages: { pageUrl: string; issueIds: string[]; requiresReview: true }[];
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

/** Read-only, page-local repair planning. Every task still needs its own claim and result. */
export function groupAgentIssueDelivery(rows: readonly { id: string }[]): AgentIssueDelivery {
  const groups: AgentIssueDelivery['groups'] = [];
  const exact = new Map<string, AgentIssueDelivery['groups'][number]>();
  const pages = new Map<string, { pageUrl: string; issueIds: string[] }>();
  for (const row of rows) {
    let key: string | undefined;
    try {
      const parsed = deliveryIssueSchema.safeParse(row);
      if (parsed.success) {
        const { screenshotPath, screenshotUrl, screenshotSha256, captureBundle } = parsed.data;
        const scope = Object.fromEntries(
          Object.entries(parsed.data).filter(
            ([key]) =>
              ![
                'id',
                'screenshotPath',
                'screenshotUrl',
                'screenshotSha256',
                'captureBundle',
              ].includes(key),
          ),
        );
        const evidence = { ...captureBundle };
        delete evidence.sourceAnnotationId;
        const pageKey = canonical([
          parsed.data.projectId,
          parsed.data.environmentId,
          captureBundle.page.url,
        ]);
        const page = pages.get(pageKey) ?? { pageUrl: captureBundle.page.url, issueIds: [] };
        page.issueIds.push(row.id);
        pages.set(pageKey, page);
        // Missing image evidence is never proof of equality. Keep the capture time and all context.
        if (
          (!screenshotPath && !screenshotUrl && captureBundle.annotationKind === 'COMMENT') ||
          screenshotSha256
        )
          key = canonical({ ...scope, evidence, screenshotSha256: screenshotSha256 ?? null });
      }
    } catch {
      // Optional planning must not suppress a task with malformed or unsupported evidence.
    }
    const previous = key === undefined ? undefined : exact.get(key);
    if (previous) {
      previous.memberIds.push(row.id);
      previous.reason = 'identical-evidence';
    } else {
      const group: AgentIssueDelivery['groups'][number] = {
        primaryId: row.id,
        memberIds: [row.id],
        reason: 'individual',
      };
      groups.push(group);
      if (key !== undefined) exact.set(key, group);
    }
  }
  return {
    groups,
    relatedPages: [...pages.values()]
      .filter((page) => page.issueIds.length > 1)
      .map((page) => ({ ...page, requiresReview: true })),
  };
}
