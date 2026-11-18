import { z } from 'zod'

/**
 * Canonical webhook event envelope for this vertical.
 *
 * WebhookResourceTypeSchema carries only 'unknown': CRM webhook payloads are
 * not classified into canonical resource categories, so every event maps to
 * the 'unknown' fallback.
 */
export const WebhookResourceTypeSchema = z
  .enum(['unknown'])
  .describe('Canonical resource category for the webhook payload. `unknown` when the event cannot be classified.')
export type WebhookResourceType = z.infer<typeof WebhookResourceTypeSchema>

export const WebhookActionSchema = z
  .enum(['created', 'updated', 'deleted', 'unknown'])
  .describe('Lifecycle action implied by the event.')
export type WebhookAction = z.infer<typeof WebhookActionSchema>

export const WebhookEventSchema = z
  .object({
    id: z.string().optional().describe('Unique event ID from the platform, if provided.').meta({ example: 'evt_cont_jane_created' }),
    platform: z.string().describe('Adapter slug, e.g. `hubspot`.').meta({ example: 'hubspot' }),
    type: z
      .string()
      .describe('Dot-notation `resource.action` string, e.g. `contact.created`. Always lower-case.')
      .meta({ example: 'contact.created' }),
    resourceType: WebhookResourceTypeSchema.meta({ example: 'unknown' }),
    action: WebhookActionSchema.meta({ example: 'created' }),
    resourceId: z.string().describe('Platform-specific resource identifier.').meta({ example: 'cont_jane' }),
    tenantId: z.string().optional().describe('Tenant / organisation ID when available.').meta({ example: 'acme' }),
    connectionId: z
      .string()
      .optional()
      .describe('Resolved connection UUID — populated by the dispatcher when a single matching connection exists.')
      .meta({ example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90' }),
    payload: z
      .record(z.string(), z.unknown())
      .describe('Complete, unmodified raw platform webhook payload.'),
  })
  .describe('Canonical webhook event envelope emitted after verifying a platform signature.')
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
