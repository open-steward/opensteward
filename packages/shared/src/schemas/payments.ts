/**
 * Shared Zod schemas for the payments vertical — namespace re-export consumed
 * by SDK callers as `import { payments } from '@opensteward/shared'`.
 *
 * The canonical, runtime-validated copies of these schemas live next to the
 * routers in `apps/integration-server/src/verticals/payments/schema/`. The
 * shapes here intentionally stay loose (most fields optional) so SDK clients
 * can build partial payloads without re-deriving every field.
 */
import { z } from 'zod'

export const MoneySchema = z.object({
  amount: z.number().int().meta({ example: 125000 }),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .meta({ example: 'USD' }),
})
export type Money = z.infer<typeof MoneySchema>

export const AddressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().length(2).optional(),
})
export type Address = z.infer<typeof AddressSchema>

export const ChargeStatusSchema = z.enum([
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
  'disputed',
  'cancelled',
])
export type ChargeStatus = z.infer<typeof ChargeStatusSchema>

export const RefundStatusSchema = z.enum(['pending', 'succeeded', 'failed', 'cancelled'])
export type RefundStatus = z.infer<typeof RefundStatusSchema>

export const SubscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
  'paused',
  'incomplete',
])
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>

export const InvoiceStatusSchema = z.enum(['draft', 'open', 'paid', 'void', 'uncollectible'])
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>

export const PayoutStatusSchema = z.enum(['pending', 'in_transit', 'paid', 'failed', 'cancelled'])
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>

export const PaymentMethodTypeSchema = z.enum([
  'card',
  'bank_account',
  'wallet',
  'bnpl',
  'a2a',
  'mandate',
  'other',
])
export type PaymentMethodType = z.infer<typeof PaymentMethodTypeSchema>

/**
 * Generic resource envelope — payments resources all carry these fields. SDK
 * callers can extend this with their own narrowing.
 */
export const PaymentsResourceBaseSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  gateway: z.string(),
  metadata: z.record(z.string(), z.string()),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type PaymentsResourceBase = z.infer<typeof PaymentsResourceBaseSchema>
