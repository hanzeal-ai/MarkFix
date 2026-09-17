import { describe, expect, it } from 'vitest';
import {
  commercialAnnotationInputSchema,
  commercialAnnotationUpdateSchema,
  commercialAnnotationListQuerySchema,
} from '../src/index.js';

describe('commercial annotation contracts', () => {
  it('keeps rejection out of ordinary edits while permitting rejection as a list filter', () => {
    expect(commercialAnnotationUpdateSchema.safeParse({ status: 'REJECTED' }).success).toBe(false);
    expect(commercialAnnotationUpdateSchema.safeParse({}).success).toBe(false);
    expect(commercialAnnotationUpdateSchema.safeParse({ status: 'IN_REVIEW' }).success).toBe(false);
    expect(commercialAnnotationListQuerySchema.safeParse({ status: 'IN_REVIEW' }).success).toBe(
      false,
    );
    expect(commercialAnnotationUpdateSchema.parse({ status: 'RESOLVED' })).toEqual({
      status: 'RESOLVED',
    });
    expect(commercialAnnotationListQuerySchema.parse({ status: 'REJECTED' })).toEqual({
      status: 'REJECTED',
      page: 1,
      pageSize: 50,
    });
  });
  it('validates input and pagination at their existing boundaries', () => {
    expect(
      commercialAnnotationInputSchema.safeParse({
        title: 'test',
        note: 'test',
        kind: 'OTHER',
        pageUrl: 'invalid',
      }).success,
    ).toBe(false);
    expect(commercialAnnotationListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
