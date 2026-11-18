import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { MessageTypeSchema, AuthorTypeSchema } from './shared'

/**
 * Message — body text inside a ticket. Public reply or internal note.
 *
 * Body text is included verbatim. Attachment CONTENT is refused — only
 * attachmentCount is surfaced. Voice/call recording audio + transcript
 * metadata refused at adapter level.
 */
export const MessageSchema = z.object({
  id: z.string().meta({ example: 'msg_1042' }),
  externalId: z.string().meta({ example: 'msg_1042' }),
  ticketId: z.string().meta({ example: 'tkt_1042' }),
  authorId: z.string().meta({ example: 'cnt_jane' }),
  authorType: AuthorTypeSchema.meta({ example: 'contact' }),
  body: z.string().meta({ example: "I can't access my account after the password reset." }),
  type: MessageTypeSchema.meta({ example: 'public' }),
  attachmentCount: z.number().int().min(0).optional().describe(
    'Derived count. Attachment CONTENT is not on the canonical schema.',
  ).meta({ example: 1 }),
  createdAt: IsoDatetime.meta({ example: '2026-01-15T09:30:00Z' }),
  platform: z.string().meta({ example: 'zendesk' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Message = z.infer<typeof MessageSchema>
