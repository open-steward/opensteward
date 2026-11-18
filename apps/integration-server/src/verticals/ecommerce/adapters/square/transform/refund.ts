/**
 * Square PaymentRefund → canonical Refund.
 *
 * Refunds in Square are payment-scoped, not order-scoped. The adapter
 * resolves order_id by looking at the payment's order_id.
 */

import type { Refund } from '../../../schema/refund'
import { squareMoneyToDecimal } from './product'

export interface RawSquareRefundMoney {
  amount?: number
  currency?: string
}

export interface RawSquarePaymentRefund {
  id: string
  payment_id?: string
  order_id?: string
  amount_money?: RawSquareRefundMoney
  reason?: string
  status?: string // PENDING, COMPLETED, REJECTED, FAILED
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawSquarePaymentRefund): Refund {
  const currency = raw.amount_money?.currency ?? 'USD'
  return {
    id: raw.id,
    orderId: raw.order_id ?? raw.payment_id ?? '',
    amount: raw.amount_money?.amount != null
      ? {
          amount: squareMoneyToDecimal(raw.amount_money.amount, currency),
          currency,
        }
      : undefined,
    reason: raw.reason ?? undefined,
    transactionIds: raw.payment_id ? [raw.payment_id] : undefined,
    processedAt: raw.created_at,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Square refund request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  // Canonical Money.amount is already in integer minor units (cents), which is
  // what Square expects — pass it through.
  const amountCents = refund.amount?.amount != null
    ? Math.round(refund.amount.amount)
    : undefined
  return {
    payment_id: refund.transactionIds?.[0] ?? refund.orderId,
    amount_money: amountCents != null
      ? { amount: amountCents, currency: refund.amount?.currency ?? 'USD' }
      : undefined,
    reason: refund.reason,
  }
}
