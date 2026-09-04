import { describe, expect, it } from 'vitest';
import { canTransitionReport } from '../src/authorization.js';

const report = { assigneeId: 'developer', reporterId: 'reporter' };

describe('report authorization', () => {
  it('allows owners and admins to manage the full workflow', () => {
    expect(canTransitionReport('owner', 'OWNER', report, 'verify')).toBe(true);
    expect(canTransitionReport('admin', 'ADMIN', report, 'start')).toBe(true);
  });

  it('allows only the assignee to start and submit implementation work', () => {
    expect(canTransitionReport('developer', 'MEMBER', report, 'start')).toBe(true);
    expect(canTransitionReport('another-member', 'MEMBER', report, 'start')).toBe(false);
  });

  it('keeps verification decisions with the reporter', () => {
    expect(canTransitionReport('reporter', 'REPORTER', report, 'reject')).toBe(true);
    expect(canTransitionReport('developer', 'MEMBER', report, 'verify')).toBe(false);
  });

  it('allows members to reopen a closed report without granting verification rights', () => {
    expect(canTransitionReport('member', 'MEMBER', report, 'reopen')).toBe(true);
    expect(canTransitionReport('member', 'MEMBER', report, 'close')).toBe(false);
  });
});
