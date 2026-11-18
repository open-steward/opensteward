import { z } from 'zod'

export const WebhookResourceTypeSchema = z.enum([
  'invoice',
  'bill',
  'contact',
  'account',
  'journal',
  'transaction',
  'taxrate',
  'expense',
  'creditmemo',
  'order',
  'salesorder',
  'purchaseorder',
  'organization',
  'payment',
  'unknown',
])
export type WebhookResourceType = z.infer<typeof WebhookResourceTypeSchema>

export const WebhookActionSchema = z.enum(['created', 'updated', 'deleted', 'unknown'])
export type WebhookAction = z.infer<typeof WebhookActionSchema>

export const WebhookEventSchema = z.object({
  /** Unique event ID from the platform, if provided. */
  id: z.string().optional().meta({ example: 'evt_inv_1042_created' }),
  /** Adapter slug, e.g. `fortnox`. */
  platform: z.string().meta({ example: 'fortnox' }),
  /**
   * Dot-notation resource.action string, e.g. `invoice.created`.
   * Always lower-case.
   */
  type: z.string().meta({ example: 'invoice.created' }),
  /** Canonical resource category. */
  resourceType: WebhookResourceTypeSchema.meta({ example: 'invoice' }),
  /** Create / update / delete. */
  action: WebhookActionSchema.meta({ example: 'created' }),
  /** Platform-specific resource identifier. */
  resourceId: z.string().meta({ example: 'inv_1042' }),
  /** Tenant / organisation ID when available (Xero tenantId, QBO realmId, etc.). */
  tenantId: z.string().optional().meta({ example: 'acme' }),
  /** Resolved connection_id (UUID) — populated by the dispatcher when a single matching connection exists. */
  connectionId: z.string().optional().meta({ example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90' }),
  /** Platform's external account id (Xero tenantId, QBO realmId) used to
   *  resolve the owning connection for inbound webhook routing. */
  externalAccountId: z.string().optional().meta({ example: 'a1b2c3d4-...' }),
  /** Complete, unmodified raw platform webhook payload. */
  payload: z.record(z.string(), z.unknown()),
})
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
