import { savedCaptureSchema, savedElementCommentSchema } from '@markfix/contracts';
import { z } from 'zod';

const previewNumber = z.number().int().positive();
export const elementCommentPinSchema = savedElementCommentSchema.extend({ previewNumber });
export type ElementCommentPin = z.infer<typeof elementCommentPinSchema>;
export const capturePinSchema = savedCaptureSchema
  .pick({
    id: true,
    projectId: true,
    pageUrl: true,
    selection: true,
  })
  .extend({ previewNumber });
export type CapturePin = z.infer<typeof capturePinSchema>;
