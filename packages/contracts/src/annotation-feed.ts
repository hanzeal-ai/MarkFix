import { z } from 'zod';

export const annotationFeedQuerySchema = z.object({ cursor: z.uuid().optional() }).strict();
export const annotationFeedSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string().min(1).max(120),
        content: z.string().min(1).max(30000),
        url: z.url(),
      }),
    )
    .max(50),
  nextCursor: z.uuid().nullable(),
});
export type AnnotationReadAuthorization = {
  active: boolean;
  expiresAt: string | null;
  authorizationUrl?: string;
};
