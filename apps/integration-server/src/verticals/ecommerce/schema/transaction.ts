import { z } from 'zod'
import { IsoDatetime, withUnknown } from '@opensteward/shared'
import { MoneySchema } from './shared'

export const TransactionKindSchema = withUnknown([
  'AUTHORIZATION',
  'CAPTURE',
  'SALE',
  'REFUND',
  'VOID',
])
export type TransactionKind = z.infer<typeof TransactionKindSchema>

export const TransactionStatusSchema = withUnknown([
  'PENDING',
  'SUCCESS',
  'FAILURE',
  'ERROR',
])
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>

export const TransactionSchema = z.object({
  id: z.string().meta({ example: 'txn_1042' }),
  orderId: z.string().optional().meta({ example: 'ord_1042' }),
  kind: TransactionKindSchema.optional().meta({ example: 'SALE' }),
  status: TransactionStatusSchema.optional().meta({ example: 'SUCCESS' }),
  amount: MoneySchema.optional(),
  /** Payment gateway slug, e.g. 'stripe' or 'shopify_payments'. */
  gateway: z.string().optional().meta({ example: 'shopify_payments' }),
  authorizationCode: z.string().optional().meta({ example: 'AUTH123456' }),
  /** For refunds/captures, the id of the authorization/sale they derive from. */
  parentTransactionId: z.string().optional().meta({ example: null }),
  errorCode: z.string().optional().meta({ example: null }),
  errorMessage: z.string().optional().meta({ example: null }),
  processedAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { transactionPlatformId: 'gid://shopify/OrderTransaction/txn_1042' } }),
})
export type Transaction = z.infer<typeof TransactionSchema>
