import { z } from 'zod'

export const WebhookResourceTypeSchema = z.enum([
  'tickets',
  'messages',
  'contacts',
  'users',
  'tags',
  'teams',
  'macros',
  'unknown',
])
export type WebhookResourceType = z.infer<typeof WebhookResourceTypeSchema>

export const WebhookActionSchema = z.enum([
  'created',
  'updated',
  'deleted',
  'assigned',
  'unassigned',
  'resolved',
  'reopened',
  'closed',
  'commented',
  'mentioned',
  'rated',
  'unknown',
])
export type WebhookAction = z.infer<typeof WebhookActionSchema>

export const WebhookEventSchema = z.object({
  id: z.string().optional().meta({ example: 'evt_1042' }),
  platform: z.string().meta({ example: 'zendesk' }),
  type: z.string().meta({ example: 'ticket.created' }),
  resourceType: WebhookResourceTypeSchema.meta({ example: 'tickets' }),
  action: WebhookActionSchema.meta({ example: 'created' }),
  resourceId: z.string().meta({ example: 'tkt_1042' }),
  ticketId: z.string().optional().meta({ example: 'tkt_1042' }),
  payload: z.record(z.string(), z.unknown()),
})
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
