import { z } from 'zod'

/**
 * Canonical webhook event envelope for the payments vertical. The resource
 * set is the union of every canonical resource the routers expose, plus
 * `unknown` for unclassifiable payloads.
 */
export const WebhookResourceTypeSchema = z.enum([
  'charges',
  'refunds',
  'customers',
  'payment_methods',
  'subscriptions',
  'invoices',
  'invoice_line_items',
  'payouts',
  'disputes',
  'plans',
  'prices',
  'products',
  'balance_transactions',
  'mandates',
  'unknown',
])
export type WebhookResourceType = z.infer<typeof WebhookResourceTypeSchema>

export const WebhookActionSchema = z.enum([
  'created',
  'updated',
  'deleted',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
  'paid',
  'voided',
  'disputed',
  'finalized',
  'unknown',
])
export type WebhookAction = z.infer<typeof WebhookActionSchema>

export const WebhookEventSchema = z.object({
  id: z.string().optional().meta({ example: 'evt_1042' }),
  platform: z.string().describe('Adapter slug, e.g. `stripe`.').meta({ example: 'stripe' }),
  type: z.string().describe('Dot-notation event identifier, e.g. `charge.succeeded`.').meta({ example: 'charge.succeeded' }),
  resourceType: WebhookResourceTypeSchema.meta({ example: 'charges' }),
  action: WebhookActionSchema.meta({ example: 'succeeded' }),
  resourceId: z.string().meta({ example: 'ch_1042' }),
  tenantId: z.string().optional().meta({ example: 'acme-industries' }),
  connectionId: z.string().optional().meta({ example: 'conn_4Qm2Xa9Lr' }),
  /** Platform's external account id (Stripe `acct_…`), used to resolve the
   *  owning connection for inbound webhook routing. */
  externalAccountId: z.string().optional().meta({ example: 'acct_1A2B3C' }),
  payload: z.record(z.string(), z.unknown()),
})
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
