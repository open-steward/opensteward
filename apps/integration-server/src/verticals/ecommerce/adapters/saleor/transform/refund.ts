/**
 * Saleor Refund → canonical Refund.
 *
 * Saleor refunds come from TransactionEvent entries with type REFUND_*.
 * The adapter constructs these raw objects from the order's payment and
 * transaction data. Composite id: `{orderId}:{transactionId}:{eventIndex}`.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawSaleorRefundEvent {
  /** Composite id set by the adapter: `orderId:transactionId:eventIndex`. */
  id: string
  orderId: string
  amount?: { amount?: number; currency?: string } | null
  type?: string
  createdAt?: string
  message?: string | null
  transactionId?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawSaleorRefundEvent): Refund {
  const currency = raw.amount?.currency ?? 'USD'
  return {
    id: raw.id,
    orderId: raw.orderId,
    amount: raw.amount?.amount != null
      ? { amount: majorToMinor(raw.amount.amount, currency), currency }
      : undefined,
    reason: raw.message ?? undefined,
    transactionIds: raw.transactionId ? [raw.transactionId] : undefined,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    amount: refund.amount?.amount != null ? refund.amount.amount / 100 : undefined,
    reason: refund.reason,
  }
}
