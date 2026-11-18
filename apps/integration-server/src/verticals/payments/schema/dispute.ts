import { z } from 'zod'
import { Iso4217Currency, IsoDatetime, withUnknown } from '@opensteward/shared'

export const DisputeStatusSchema = withUnknown([
  'warning_needs_response',
  'warning_under_review',
  'warning_closed',
  'needs_response',
  'under_review',
  'won',
  'lost',
  'charge_refunded',
])
export type DisputeStatus = z.infer<typeof DisputeStatusSchema>

export const DisputeReasonSchema = withUnknown([
  'duplicate',
  'fraudulent',
  'subscription_cancelled',
  'product_not_received',
  'product_unacceptable',
  'credit_not_processed',
  'general',
  'unrecognized',
  'other',
])
export type DisputeReason = z.infer<typeof DisputeReasonSchema>

export const DisputeSchema = z.object({
  id: z.string().meta({ example: 'dp_1042' }),
  externalId: z.string().meta({ example: 'dp_1042' }),
  chargeId: z.string().meta({ example: 'ch_1042' }),
  amount: z.number().int().meta({ example: 125000 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  status: DisputeStatusSchema.meta({ example: 'won' }),
  reason: DisputeReasonSchema.optional().meta({ example: 'fraudulent' }),
  evidenceDueBy: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  network: z.string().optional().describe('Card network, e.g. `visa`, `mastercard`.').meta({ example: 'visa' }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Dispute = z.infer<typeof DisputeSchema>
