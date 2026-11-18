import { z } from 'zod'

/**
 * Canonical webhook event envelope for this vertical.
 *
 * Resource types cover the full set of ecommerce canonical resources.
 * `unknown` remains as a fallback for payloads that cannot be classified.
 */
export const WebhookResourceTypeSchema = z.enum([
  'products',
  'variants',
  'collections',
  'locations',
  'orders',
  'customers',
  'fulfillments',
  'refunds',
  'transactions',
  'inventory_levels',
  'discounts',
  'unknown',
])
export type WebhookResourceType = z.infer<typeof WebhookResourceTypeSchema>

export const WebhookActionSchema = z.enum(['created', 'updated', 'deleted', 'unknown'])
export type WebhookAction = z.infer<typeof WebhookActionSchema>

export const WebhookEventSchema = z.object({
  /** Unique event ID from the platform, if provided. */
  id: z.string().optional().meta({ example: 'evt_ord1042_created' }),
  /** Adapter slug, e.g. `example`. */
  platform: z.string().meta({ example: 'shopify' }),
  /**
   * Dot-notation resource.action string, e.g. `shipment.created`.
   * Always lower-case.
   */
  type: z.string().meta({ example: 'orders.created' }),
  /** Canonical resource category. */
  resourceType: WebhookResourceTypeSchema.meta({ example: 'orders' }),
  /** Create / update / delete. */
  action: WebhookActionSchema.meta({ example: 'created' }),
  /** Platform-specific resource identifier. */
  resourceId: z.string().meta({ example: 'ord_1042' }),
  /** Tenant / organisation ID when available. */
  tenantId: z.string().optional().meta({ example: 'acme-industries' }),
  /** Resolved connection_id (UUID) — populated by the dispatcher when a single matching connection exists. */
  connectionId: z.string().optional().meta({ example: '3f1c2d4e-5a6b-7c8d-9e0f-1a2b3c4d5e6f' }),
  /** Complete, unmodified raw platform webhook payload. */
  payload: z.record(z.string(), z.unknown()).meta({ example: { id: 'ord_1042', name: '#1042', financial_status: 'paid' } }),
})
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
