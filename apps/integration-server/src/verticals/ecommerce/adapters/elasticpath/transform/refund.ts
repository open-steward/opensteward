/**
 * Elastic Path Refund → canonical Refund.
 *
 * Elastic Path refunds are transactions with `transaction_type: 'refund'`
 * on an order: `POST /v2/orders/{orderId}/transactions` with
 * `{ type: 'transaction', transaction_type: 'refund', amount: cents }`.
 *
 * We derive refunds by filtering order transactions for type=refund.
 * Money is in integer cents.
 */

import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawEpRefundTransaction {
  id: string
  type: string // transaction
  transaction_type?: string // refund
  amount?: number // integer cents
  currency?: string
  status?: string // complete | pending | failed
  reference?: string
  relationships?: {
    order?: { data?: { type: string; id: string } }
    [key: string]: unknown
  }
  timestamps?: {
    created_at?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformRefund(raw: RawEpRefundTransaction, orderId?: string): Refund {
  const resolvedOrderId = orderId ?? raw.relationships?.order?.data?.id ?? ''
  return {
    id: raw.id,
    orderId: resolvedOrderId,
    amount:
      raw.amount != null
        ? { amount: Math.round(raw.amount), currency: raw.currency ?? 'USD' }
        : undefined,
    transactionIds: [raw.id],
    processedAt: raw.status === 'complete' ? raw.timestamps?.created_at : undefined,
    createdAt: toIsoDatetime(raw.timestamps?.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
