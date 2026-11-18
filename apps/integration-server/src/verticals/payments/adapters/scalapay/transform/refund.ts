import type { Refund } from '../../../schema/refund'
import {
  pickCurrency,
  strMap,
  toIsoDatetime,
  toMinorUnits,
  type ScalapayMoney,
} from './shared'

/**
 * Scalapay refund record. Covers the `POST /v2/payments/{token}/refund`
 * response (`refundToken`, `token`, `merchantReference`, `amount`,
 * `refundedAt`) and the `GET /v1/reporting/refunds` list rows (which may
 * flatten the money fields and carry the parent order token).
 *
 * Docs: https://developers.scalapay.com/reference/post_v2-payments-token-refund
 */
export interface RawScalapayRefund {
  /** Unique id of the refund. */
  refundToken?: string
  /** Parent order/payment token the refund belongs to. */
  token?: string
  orderToken?: string
  merchantReference?: string
  merchantRefundReference?: string
  /** Transactional response nests the money as `{ amount, currency }`. */
  amount?: ScalapayMoney | string | number
  refundAmount?: ScalapayMoney | string | number
  currency?: string
  status?: string
  refundedAt?: string
  refundDate?: string
  createdAt?: string
  [k: string]: unknown
}

function moneyOf(
  m: ScalapayMoney | string | number | undefined,
): { amount?: string | number; currency?: string } {
  if (m === null || m === undefined) return {}
  if (typeof m === 'object') return { amount: m.amount, currency: m.currency }
  return { amount: m }
}

function mapStatus(raw: RawScalapayRefund): Refund['status'] {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'REFUNDED':
    case 'COMPLETED':
    case 'SUCCEEDED':
    case 'PROCESSED':
      return 'succeeded'
    case 'PENDING':
    case 'PROCESSING':
      return 'pending'
    case 'FAILED':
    case 'DECLINED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    default:
      // A refund record returned by the refund endpoint is, by construction,
      // an accepted refund — treat an absent status as success.
      return raw.status ? 'pending' : 'succeeded'
  }
}

export function transformRefund(raw: RawScalapayRefund): Refund {
  const money = moneyOf(raw.refundAmount ?? raw.amount)
  const currency = pickCurrency(money.currency ?? raw.currency)
  const amount = toMinorUnits(money.amount, currency)
  const refundedAt = toIsoDatetime(raw.refundedAt ?? raw.refundDate ?? raw.createdAt)

  return {
    id: String(raw.refundToken ?? ''),
    externalId: String(raw.refundToken ?? ''),
    chargeId: String(raw.token ?? raw.orderToken ?? ''),
    amount,
    currency: currency ?? 'EUR',
    status: mapStatus(raw),
    gateway: 'scalapay',
    metadata: strMap({
      merchantReference: raw.merchantReference,
      merchantRefundReference: raw.merchantRefundReference,
      scalapayStatus: raw.status,
    }),
    createdAt: refundedAt,
    updatedAt: refundedAt,
    raw,
  }
}
