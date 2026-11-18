import { z } from 'zod'
import { IsoDatetime } from '@opensteward/shared'
import { MoneySchema } from './shared'

export const RefundLineItemSchema = z.object({
  lineItemId: z.string().meta({ example: 'li_1' }),
  quantity: z.number().int().min(0).meta({ example: 1 }),
  amount: MoneySchema.optional(),
})
export type RefundLineItem = z.infer<typeof RefundLineItemSchema>

export const RefundSchema = z.object({
  id: z.string().meta({ example: 'ref_1042' }),
  orderId: z.string().meta({ example: 'ord_1042' }),
  amount: MoneySchema.optional(),
  reason: z.string().optional().meta({ example: 'Customer changed mind' }),
  note: z.string().optional().meta({ example: 'Refunded one keyboard.' }),
  /** Whether refunded items should be returned to inventory. */
  restock: z.boolean().optional().meta({ example: true }),
  refundLineItems: z.array(RefundLineItemSchema).optional(),
  transactionIds: z.array(z.string()).optional().meta({ example: ['txn_1042'] }),
  processedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  createdAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { refundPlatformId: 'gid://shopify/Refund/ref_1042' } }),
})
export type Refund = z.infer<typeof RefundSchema>
