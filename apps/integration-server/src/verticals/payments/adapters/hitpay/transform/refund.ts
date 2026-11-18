import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A HitPay refund — created via `POST /refund` against a settled `payment_id`.
 * Amounts are decimal-string major units; `status` may be null while the
 * refund is being processed.
 */
export interface RawHitpayRefund {
  id?: string
  payment_id?: string
  amount_refunded?: string | number
  total_amount?: string | number
  currency?: string
  status?: string | null
  payment_method?: string
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawHitpayRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'succeeded':
    case 'success':
    case 'completed':
    case 'refunded':
      return 'succeeded'
    case 'failed':
    case 'rejected':
      return 'failed'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    case 'pending':
    case '':
      // A null/absent status means the refund is still being processed.
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawHitpayRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: toMinorUnits(raw.amount_refunded),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    gateway: 'hitpay',
    metadata: strMap({
      payment_method: raw.payment_method,
      total_amount: raw.total_amount,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
