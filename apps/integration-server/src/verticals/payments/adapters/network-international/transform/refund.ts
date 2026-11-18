/**
 * Network International (N-Genius) refund ↔ canonical Refund.
 *
 * Refunds are issued against a capture; the response echoes the payment with
 * an `_embedded['cnp:refund'][]` array. Each refund object carries its own
 * `state` ("SUCCESS"), `amount` ({ currencyCode, value }), and timestamps.
 * The most recent embedded refund is the one this call produced.
 *
 * Transforms never throw — missing optionals collapse to `undefined`.
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickAmount, pickCurrency, strMap, toIsoDatetime, type NgeniusAmount } from './shared'

export interface RawNgeniusRefundEntry {
  state?: string
  amount?: NgeniusAmount
  createdTime?: string | number
  updatedTime?: string | number
  reference?: string
  _id?: string
  [k: string]: unknown
}

export interface RawNgeniusRefundResponse {
  _id?: string
  reference?: string
  orderReference?: string
  state?: string
  amount?: NgeniusAmount
  updateDateTime?: string
  _embedded?: { 'cnp:refund'?: RawNgeniusRefundEntry[] }
  [k: string]: unknown
}

function mapStatus(state: string | undefined): RefundStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'SUCCESS':
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return 'succeeded'
    case 'FAILED':
    case 'DECLINED':
      return 'failed'
    case 'REVERSED':
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

/** Last (most recent) embedded refund — the one this call created. */
function latestEntry(raw: RawNgeniusRefundResponse): RawNgeniusRefundEntry | undefined {
  const entries = raw._embedded?.['cnp:refund']
  if (!entries || entries.length === 0) return undefined
  return entries[entries.length - 1]
}

export function transformRefund(raw: RawNgeniusRefundResponse): Refund {
  const entry = latestEntry(raw)
  const amountObj = entry?.amount ?? raw.amount
  const state = entry?.state ?? raw.state
  const refundId = String(entry?.reference ?? entry?._id ?? raw.reference ?? raw._id ?? '')

  return {
    id: refundId,
    externalId: refundId,
    chargeId: String(raw.orderReference ?? raw.reference ?? ''),
    amount: pickAmount(amountObj),
    currency: pickCurrency(amountObj),
    status: mapStatus(state),
    gateway: 'network-international',
    metadata: strMap({ paymentReference: raw.reference, paymentState: raw.state }),
    createdAt: toIsoDatetime(entry?.createdTime),
    updatedAt: toIsoDatetime(entry?.updatedTime ?? raw.updateDateTime),
    raw,
  }
}
