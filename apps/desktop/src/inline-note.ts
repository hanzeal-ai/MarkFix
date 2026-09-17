import { z } from 'zod';
import { anchorSchema } from '@markfix/contracts';

export const inlineNoteSchema = z.object({
  mode: z.enum(['comment', 'capture']),
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
