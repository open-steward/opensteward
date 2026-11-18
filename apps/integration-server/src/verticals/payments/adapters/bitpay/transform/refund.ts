import { toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * BitPay refund → canonical Refund.
 *
 * A refund is always taken against an invoice (`invoice` holds the invoice id,
 * which is the canonical `chargeId`). `amount` is the fiat major-unit value in
 * the invoice's `currency`; we scale it to integer minor units. BitPay refund
 * status is a small set — `created` (and its terminal successors) vs
 * `canceled` — with the crypto-settlement detail surfaced via the
 * `transaction*` fields, which we carry in `metadata`.
 *
 * Docs: https://developer.bitpay.com/reference/create-a-refund-request
 *       https://developer.bitpay.com/reference/refunds
 */
export interface RawBitpayRefund {
  id?: string
  guid?: string
  invoice?: string
  reference?: string
  status?: string
  amount?: number
  currency?: string
  transactionCurrency?: string
  transactionAmount?: number
  transactionRefundFee?: number
  refundFee?: number
  immediate?: boolean
  buyerPaysRefundFee?: boolean
  requestDate?: string
  lastRefundNotification?: string
  [k: string]: unknown
}

function mapStatus(raw: RawBitpayRefund): Refund['status'] {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
    case 'completed':
      return 'succeeded'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'failed'
    case 'created':
    case 'pending':
    case 'preview':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawBitpayRefund): Refund {
  const currency = pickCurrency(raw.currency)
  return {
    id: String(raw.id ?? raw.guid ?? ''),
    externalId: String(raw.id ?? raw.guid ?? ''),
    chargeId: String(raw.invoice ?? ''),
    amount: toMinorUnits(raw.amount, currency),
    currency,
    status: mapStatus(raw),
    gateway: 'bitpay',
    metadata: strMap({
      reference: raw.reference,
      status: raw.status,
      transactionCurrency: raw.transactionCurrency,
      transactionAmount: raw.transactionAmount,
      transactionRefundFee: raw.transactionRefundFee,
      refundFee: raw.refundFee,
      immediate: raw.immediate,
      buyerPaysRefundFee: raw.buyerPaysRefundFee,
    }),
    createdAt: toIsoDatetime(raw.requestDate),
    updatedAt: toIsoDatetime(raw.lastRefundNotification),
    raw,
  }
}
