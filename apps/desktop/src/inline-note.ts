import { z } from 'zod';
import { anchorSchema } from '@markfix/contracts';

export const inlineNoteSchema = z.object({
  mode: z.enum(['comment', 'capture']),
  annotationId: z.uuid().optional(),
  anchor: anchorSchema,
  note: z.string().max(2000),
  ready: z.boolean(),
});
export type InlineNote = z.infer<typeof inlineNoteSchema>;
export const inlineNoteActionSchema = z.object({
  action: z.enum(['change', 'submit', 'cancel']),
  mode: z.enum(['comment', 'capture']),
  documentUrl: z.string().max(8192),
  note: z.string().max(2000),
});
export type InlineNoteAction = z.infer<typeof inlineNoteActionSchema>;

export const elementReselectSchema = z.object({
  documentUrl: z.string().max(8192),
  x: z.number().int().nonnegative().max(100000),
  y: z.number().int().nonnegative().max(100000),
});
