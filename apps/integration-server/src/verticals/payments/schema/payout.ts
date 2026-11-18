import { z } from 'zod'
import { Iso4217Currency, IsoDatetime, withUnknown } from '@opensteward/shared'

export const PayoutStatusSchema = withUnknown([
  'pending',
  'in_transit',
  'paid',
  'failed',
  'cancelled',
])
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>

export const PayoutMethodSchema = withUnknown(['standard', 'instant'])
export type PayoutMethod = z.infer<typeof PayoutMethodSchema>

export const PayoutSchema = z.object({
  id: z.string().meta({ example: 'po_1042' }),
  externalId: z.string().meta({ example: 'po_1042' }),
  amount: z.number().int().meta({ example: 125000 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  status: PayoutStatusSchema.meta({ example: 'paid' }),
  method: PayoutMethodSchema.optional().meta({ example: 'standard' }),
  arrivalDate: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  destinationLast4: z.string().optional().meta({ example: '4242' }),
  statementDescriptor: z.string().optional().meta({ example: 'ACME PAYOUT' }),
  failureCode: z.string().optional().meta({ example: null }),
  failureMessage: z.string().optional().meta({ example: null }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Payout = z.infer<typeof PayoutSchema>
