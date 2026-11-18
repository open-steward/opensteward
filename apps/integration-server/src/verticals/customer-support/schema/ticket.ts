import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import {
  TicketStatusSchema,
  TicketPrioritySchema,
  ChannelSchema,
} from './shared'

export const TicketSchema = z.object({
  id: z.string().meta({ example: 'tkt_1042' }),
  externalId: z.string().meta({ example: 'tkt_1042' }),
  number: z.string().optional().meta({ example: '1042' }),
  subject: z.string().meta({ example: 'Unable to log in' }),
  status: TicketStatusSchema.meta({ example: 'open' }),
  priority: TicketPrioritySchema.optional().meta({ example: 'high' }),
  channel: ChannelSchema.meta({ example: 'email' }),
  requesterId: z.string().meta({ example: 'cnt_jane' }),
  assigneeId: z.string().optional().meta({ example: 'usr_olivia' }),
  teamId: z.string().optional().meta({ example: 'team_support' }),
  tagIds: z.array(z.string().meta({ example: 'tag_login' })),
  parentTicketId: z.string().optional().describe(
    'Optional parent reference for ticket merging (Zendesk) / sub-tickets (Salesforce Service Cloud). Most platforms unused.',
  ).meta({ example: 'tkt_1000' }),
  satisfactionRating: z.number().int().min(1).max(5).optional().describe(
    'Normalised 1-5 rating. Raw scale + free-text response refused at schema level.',
  ).meta({ example: 5 }),
  createdAt: IsoDatetime.meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  resolvedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  closedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  platform: z.string().meta({ example: 'zendesk' }),
  metadata: z.record(z.string(), z.string()),
  raw: z.unknown().optional(),
})
export type Ticket = z.infer<typeof TicketSchema>
