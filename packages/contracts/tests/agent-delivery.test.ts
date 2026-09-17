import { expect, it } from 'vitest';
import { groupAgentIssueDelivery } from '../src/agent-delivery.js';

const randomUUID = () => crypto.randomUUID();

const sample = () => ({
  id: randomUUID(),
  projectId: randomUUID(),
  environmentId: null,
  reporterId: null,
  assigneeId: null,
  title: '截图批注',
  description: '加载慢',
  status: 'OPEN',
  priority: 'MEDIUM',
  screenshotPath: randomUUID(),
  screenshotSha256: 'a'.repeat(64),
  captureBundle: {
    schemaVersion: 1,
    annotationKind: 'SCREENSHOT',
    sourceAnnotationId: randomUUID(),
    page: {
      url: 'http://localhost:4000/growth/albums?tab=video#list',
      capturedAt: '2026-09-17T02:16:00.000Z',
    },
    anchor: { x: 10, y: 20 },
    annotations: [],
    reproduction: [],
  },
});

it('plans identical evidence once without losing IDs or mutating the original records', () => {
  const first = sample();
  const second = { ...structuredClone(first), id: randomUUID(), screenshotPath: randomUUID() };
  second.captureBundle.sourceAnnotationId = randomUUID();
  const rows = [first, second];
  const before = structuredClone(rows);
  const result = groupAgentIssueDelivery(rows);
  expect(result.groups).toEqual([
    { primaryId: first.id, memberIds: [first.id, second.id], reason: 'identical-evidence' },
  ]);
  expect(rows).toEqual(before);
});

it.each([
  ['description', '视频列表加载速度过慢'],
  ['projectId', randomUUID()],
  ['environmentId', randomUUID()],
  ['assigneeId', randomUUID()],
  ['reporterId', randomUUID()],
  ['status', 'FIX_FAILED'],
  ['priority', 'HIGH'],
  ['screenshotSha256', 'b'.repeat(64)],
])('does not merge a different %s', (field, value) => {
  const first = sample();
  const second = { ...structuredClone(first), id: randomUUID(), [field]: value };
  expect(groupAgentIssueDelivery([first, second]).groups).toHaveLength(2);
});

it.each(['page', 'capture-time', 'anchor', 'reproduction', 'evidence'])(
  'keeps differing %s context',
  (field) => {
    const first = sample();
    const second = { ...structuredClone(first), id: randomUUID() };
    if (field === 'page') second.captureBundle.page.url += '-other';
    if (field === 'capture-time') second.captureBundle.page.capturedAt = '2026-09-17T02:17:00.000Z';
    if (field === 'anchor') second.captureBundle.anchor.x++;
    if (field === 'reproduction')
      Object.assign(second.captureBundle, { reproduction: [{ description: 'Different step' }] });
    if (field === 'evidence')
      Object.assign(second.captureBundle, { evidence: [{ message: 'Another failure' }] });
    expect(groupAgentIssueDelivery([first, second]).groups).toHaveLength(2);
  },
);

it('retains missing/malformed evidence and only marks same-page records for review', () => {
  const first = sample();
  const second = {
    ...structuredClone(first),
    id: randomUUID(),
    description: '视频列表加载速度过慢',
    screenshotSha256: null,
  };
  const malformed = { id: randomUUID(), captureBundle: null };
  const rows = [first, second, malformed];
  const result = groupAgentIssueDelivery(rows);
  expect(result.groups.flatMap((group) => group.memberIds)).toEqual(rows.map((row) => row.id));
  expect(result.groups.every((group) => group.reason === 'individual')).toBe(true);
  expect(result.relatedPages).toEqual([
    {
      pageUrl: first.captureBundle.page.url,
      issueIds: [first.id, second.id],
      requiresReview: true,
    },
  ]);
});

it('does not confuse object key order with changed evidence', () => {
  const first = sample();
  const second = { ...structuredClone(first), id: randomUUID() };
  second.captureBundle.anchor = { y: 20, x: 10 };
  expect(groupAgentIssueDelivery([first, second]).groups).toHaveLength(1);
});
