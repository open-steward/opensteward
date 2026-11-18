import { z } from 'zod'
import {
  Amount,
  Description,
  Email,
  ExternalId,
  Iso4217Currency,
  IsoDatetime,
  nullish,
  withUnknown,
} from '@opensteward/shared'

export const ChargeStatusSchema = withUnknown([
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
  'disputed',
  'cancelled',
])
export type ChargeStatus = z.infer<typeof ChargeStatusSchema>

export const ChargeSchema = z.object({
  id: ExternalId.meta({ example: 'ch_1042' }),
  externalId: ExternalId.meta({ example: 'ch_1042' }),
  amount: Amount.describe('Gross charge amount in minor units.').meta({ example: 125000 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  amountRefunded: nullish(Amount).meta({ example: 0 }),
  amountCaptured: nullish(Amount).meta({ example: 125000 }),
  status: ChargeStatusSchema.meta({ example: 'succeeded' }),
  captured: z.boolean().optional().meta({ example: true }),
  capturedAt: nullish(IsoDatetime).meta({ example: '2026-01-15T09:30:00Z' }),
  customerId: nullish(ExternalId).meta({ example: 'cus_4Qm2Xa9Lr' }),
  paymentMethodId: nullish(ExternalId).meta({ example: 'pm_1042' }),
  invoiceId: nullish(ExternalId).meta({ example: 'inv_1042' }),
  subscriptionId: nullish(ExternalId).meta({ example: 'sub_1042' }),
  description: nullish(Description).meta({ example: 'Invoice INV-1042' }),
  statementDescriptor: nullish(z.string().max(64)).meta({ example: 'ACME INV-1042' }),
  failureCode: nullish(z.string().max(128)).meta({ example: null }),
  failureMessage: nullish(z.string().max(2000)).meta({ example: null }),
  receiptUrl: nullish(z.url()).meta({ example: 'https://pay.stripe.com/receipts/ch_1042' }),
  receiptEmail: nullish(Email).meta({ example: 'jane.doe@acme.example' }),
  refundIds: z.array(ExternalId).optional().meta({ example: ['re_1042'] }),
  disputeIds: z.array(ExternalId).optional().meta({ example: [] }),
  gateway: z.string().max(64).meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: nullish(IsoDatetime).meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: nullish(IsoDatetime).meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Charge = z.infer<typeof ChargeSchema>
