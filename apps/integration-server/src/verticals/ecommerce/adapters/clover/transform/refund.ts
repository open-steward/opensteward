/**
 * Clover Refund → canonical Refund.
 *
 * Clover refunds are order-scoped. `GET /orders/{id}/refunds` returns
 * an array of refund objects.
 */

import type { Refund } from '../../../schema/refund'
import { cloverCentsToMinor } from './product'

export interface RawCloverRefund {
  id: string
  orderRef?: { id?: string }
  payment?: { id?: string }
  amount?: number // integer cents
  createdTime?: number
  [key: string]: unknown
}

export function transformRefund(raw: RawCloverRefund): Refund {
  const currency = 'USD'
  return {
    id: raw.id,
    orderId: raw.orderRef?.id ?? '',
    amount: raw.amount != null
      ? { amount: cloverCentsToMinor(raw.amount), currency }
      : undefined,
    transactionIds: raw.payment?.id ? [raw.payment.id] : undefined,
    createdAt: raw.createdTime ? new Date(raw.createdTime).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Clover refund request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    amount: refund.amount?.amount != null
      ? Math.round(refund.amount.amount)
      : undefined,
    reason: refund.reason,
  }
}
