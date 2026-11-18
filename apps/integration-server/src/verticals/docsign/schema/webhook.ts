import { z } from 'zod'

export const WebhookResourceTypeSchema = z.enum([
  'envelopes',
  'signers',
  'documents',
  'audit_trail_entries',
  'templates',
  'unknown',
])
export type WebhookResourceType = z.infer<typeof WebhookResourceTypeSchema>

export const WebhookActionSchema = z.enum([
  'created',
  'sent',
  'delivered',
  'viewed',
  'signed',
  'declined',
  'completed',
  'voided',
  'expired',
  'updated',
  'deleted',
  'unknown',
])
export type WebhookAction = z.infer<typeof WebhookActionSchema>

export const WebhookEventSchema = z.object({
  id: z.string().optional().meta({ example: 'evt_env_1042_completed' }),
  platform: z.string().meta({ example: 'docusign' }),
  type: z.string().meta({ example: 'envelope.completed' }),
  resourceType: WebhookResourceTypeSchema.meta({ example: 'envelopes' }),
  action: WebhookActionSchema.meta({ example: 'completed' }),
  resourceId: z.string().meta({ example: 'env_1042' }),
  envelopeId: z.string().optional().meta({ example: 'env_1042' }),
  payload: z.record(z.string(), z.unknown()),
})
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
