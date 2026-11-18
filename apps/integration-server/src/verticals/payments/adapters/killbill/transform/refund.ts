import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import type { RawKillbillPayment, RawKillbillTransaction } from './charge'
import { requireCurrency, requireId, toMinor } from './shared'

/**
 * Kill Bill has no refund list: a refund is "A new PaymentTransaction of type
 * REFUND" on a Payment (https://killbill.github.io/slate/payment.html). A
 * Refund is one REFUND transaction, flattened out of its payment.
 */
export type RawKillbillRefund = RawKillbillTransaction

function mapStatus(s: unknown): RefundStatus {
  switch (s) {
    case 'SUCCESS':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'PAYMENT_FAILURE':
    case 'PLUGIN_FAILURE':
    case 'PAYMENT_SYSTEM_OFF':
      return 'failed'
    default:
      return 'unknown'
  }
}

export function transformRefund(raw: RawKillbillRefund): Refund {
  const id = requireId(raw.transactionId, 'transactionId', 'refund transaction')
  const chargeId = requireId(raw.paymentId, 'paymentId', 'refund transaction')
  const currency = requireCurrency(raw.currency, 'refund transaction')
  const amount = toMinor(raw.amount, currency)
  if (amount === undefined) throw new Error(`Kill Bill refund transaction ${id} has no amount`)
  return {
    id,
    externalId: id,
    chargeId,
    amount,
    currency,
    status: mapStatus(raw.status),
    ...(typeof raw.gatewayErrorMsg === 'string' && raw.gatewayErrorMsg
      ? { failureReason: raw.gatewayErrorMsg }
      : {}),
    gateway: 'killbill',
    metadata: {},
    createdAt: toIsoDatetime(raw.effectiveDate),
    raw,
  }
}

/** The REFUND transactions of one payment, in the payment's own order. */
export function refundsOf(payment: RawKillbillPayment): Refund[] {
  return (payment.transactions ?? [])
    .filter((t) => t.transactionType === 'REFUND')
    .map(transformRefund)
}
