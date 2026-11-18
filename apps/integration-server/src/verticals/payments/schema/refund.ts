import { z } from 'zod'
import { Iso4217Currency, IsoDatetime, withUnknown } from '@opensteward/shared'

export const RefundStatusSchema = withUnknown(['pending', 'succeeded', 'failed', 'cancelled'])
export type RefundStatus = z.infer<typeof RefundStatusSchema>

export const RefundReasonSchema = withUnknown([
  'requested_by_customer',
  'duplicate',
  'fraudulent',
  'expired_uncaptured_charge',
  'other',
])
export type RefundReason = z.infer<typeof RefundReasonSchema>

export const RefundSchema = z.object({
  id: z.string().meta({ example: 're_1042' }),
  externalId: z.string().meta({ example: 're_1042' }),
  chargeId: z.string().meta({ example: 'ch_1042' }),
  amount: z.number().int().min(0).meta({ example: 125000 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  status: RefundStatusSchema.meta({ example: 'succeeded' }),
  reason: RefundReasonSchema.optional().meta({ example: 'requested_by_customer' }),
  failureReason: z.string().optional().meta({ example: null }),
  receiptNumber: z.string().optional().meta({ example: '1042-0001' }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Refund = z.infer<typeof RefundSchema>
