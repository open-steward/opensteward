import { z } from 'zod'
import { Iso4217Currency, IsoDatetime, withUnknown } from '@opensteward/shared'

export const SubscriptionStatusSchema = withUnknown([
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
  'paused',
  'incomplete',
])
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>

export const CollectionMethodSchema = withUnknown(['charge_automatically', 'send_invoice'])
export type CollectionMethod = z.infer<typeof CollectionMethodSchema>

export const SubscriptionItemSchema = z.object({
  id: z.string().meta({ example: 'si_1042' }),
  priceId: z.string().optional().meta({ example: 'price_1042' }),
  productId: z.string().optional().meta({ example: 'prod_1042' }),
  quantity: z.number().int().min(0).optional().meta({ example: 1 }),
  amount: z.number().int().optional().describe('Unit amount in minor units.').meta({ example: 125000 }),
  metadata: z.record(z.string(), z.string()).optional(),
})
export type SubscriptionItem = z.infer<typeof SubscriptionItemSchema>

export const SubscriptionSchema = z.object({
  id: z.string().meta({ example: 'sub_1042' }),
  externalId: z.string().meta({ example: 'sub_1042' }),
  customerId: z.string().meta({ example: 'cus_4Qm2Xa9Lr' }),
  status: SubscriptionStatusSchema.meta({ example: 'active' }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  items: z.array(SubscriptionItemSchema),
  currentPeriodStart: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  currentPeriodEnd: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  billingAnchor: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  trialStart: IsoDatetime.optional().meta({ example: null }),
  trialEnd: IsoDatetime.optional().meta({ example: null }),
  cancelAt: IsoDatetime.optional().meta({ example: null }),
  cancelledAt: IsoDatetime.optional().meta({ example: null }),
  cancelAtPeriodEnd: z.boolean().optional().meta({ example: false }),
  collectionMethod: CollectionMethodSchema.optional().meta({ example: 'charge_automatically' }),
  dunningState: z.string().optional().meta({ example: null }),
  defaultPaymentMethodId: z.string().optional().meta({ example: 'pm_1042' }),
  latestInvoiceId: z.string().optional().meta({ example: 'inv_1042' }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Subscription = z.infer<typeof SubscriptionSchema>
