import type { Refund, RefundStatus } from '../../../schema/refund'
import { DEFAULT_CURRENCY } from '../constants'
import { strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * An Easebuzz refund as returned by `POST /transaction/v2/refund` and
 * `POST /refund/v1/retrieve`. Easebuzz keys a refund by `merchant_refund_id`
 * (caller-supplied) and `easebuzz_id` (the parent transaction's easepayid);
 * the gateway-assigned refund id surfaces as `refund_id` / `easy_refund_id`.
 */
export interface RawEasebuzzRefund {
  refund_id?: string
  easy_refund_id?: string
  merchant_refund_id?: string
  easebuzz_id?: string
  txnid?: string
  refund_amount?: string
  amount?: string
  refund_status?: string
  status?: string
  reason?: string
  refund_reason?: string
  settled?: string
  addedon?: string
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawEasebuzzRefund): RefundStatus {
  switch ((raw.refund_status ?? raw.status ?? '').toLowerCase()) {
    case 'refunded':
    case 'processed':
    case 'success':
    case 'completed':
      return 'succeeded'
    case 'queued':
    case 'initiated':
    case 'pending':
    case 'processing':
      return 'pending'
    case 'rejected':
    case 'failed':
    case 'failure':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawEasebuzzRefund, chargeId?: string): Refund {
  const id = String(raw.easy_refund_id ?? raw.refund_id ?? raw.merchant_refund_id ?? '')
  return {
    id,
    externalId: String(raw.easy_refund_id ?? raw.refund_id ?? raw.merchant_refund_id ?? ''),
    chargeId: String(chargeId ?? raw.easebuzz_id ?? raw.txnid ?? ''),
    amount: toMinorUnits(raw.refund_amount ?? raw.amount),
    currency: DEFAULT_CURRENCY,
    status: mapStatus(raw),
    failureReason: (raw.reason || raw.refund_reason) ?? undefined,
    gateway: 'easebuzz',
    metadata: strMap({
      merchant_refund_id: raw.merchant_refund_id,
      refund_id: raw.refund_id,
      raw_status: raw.refund_status ?? raw.status,
      settled: raw.settled,
    }),
    createdAt: toIsoDatetime(raw.created_at ?? raw.addedon),
    updatedAt: toIsoDatetime(raw.addedon ?? raw.created_at),
    raw,
  }
}
