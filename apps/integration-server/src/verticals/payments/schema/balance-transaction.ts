import { z } from 'zod'
import { Iso4217Currency, IsoDatetime, withUnknown } from '@opensteward/shared'

export const BalanceTransactionTypeSchema = withUnknown([
  'charge',
  'refund',
  'payout',
  'adjustment',
  'fee',
  'dispute',
  'transfer',
  'application_fee',
  'other',
])
export type BalanceTransactionType = z.infer<typeof BalanceTransactionTypeSchema>

export const FeeSchema = z.object({
  amount: z.number().int().meta({ example: 3925 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  type: z.string().describe('Gateway fee classifier (e.g. `stripe_fee`, `application_fee`).').meta({ example: 'stripe_fee' }),
  description: z.string().optional().meta({ example: 'Stripe processing fee' }),
})
export type Fee = z.infer<typeof FeeSchema>

export const BalanceTransactionSchema = z.object({
  id: z.string().meta({ example: 'txn_1042' }),
  externalId: z.string().meta({ example: 'txn_1042' }),
  type: BalanceTransactionTypeSchema.meta({ example: 'charge' }),
  amount: z.number().int().describe('Gross amount in minor units (can be negative).').meta({ example: 125000 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  fee: z.number().int().optional().describe('Total fee in minor units.').meta({ example: 3925 }),
  feeDetails: z.array(FeeSchema).optional(),
  net: z.number().int().optional().meta({ example: 121075 }),
  sourceId: z.string().optional().describe('Foreign key to charge / refund / payout / dispute.').meta({ example: 'ch_1042' }),
  sourceType: z.string().optional().meta({ example: 'charge' }),
  availableOn: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  description: z.string().optional().meta({ example: 'Invoice INV-1042' }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  raw: z.unknown().optional(),
})
export type BalanceTransaction = z.infer<typeof BalanceTransactionSchema>
