import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Raw shape of a DOKU refund response. DOKU returns the original order under
 * `order`, the originating transaction under `transaction`, and the refund
 * result under `refund`.
 */
export interface RawDokuRefund {
  order?: {
    invoice_number?: string
    amount?: number | string
    currency?: string
  }
  transaction?: {
    status?: string
    date?: string
    original_request_id?: string
  }
  refund?: {
    amount?: number | string
    status?: string
    reason?: string
    date?: string
    id?: string
    original_request_id?: string
  }
  [k: string]: unknown
}

function mapStatus(raw: RawDokuRefund): RefundStatus {
  const status = (raw.refund?.status ?? raw.transaction?.status ?? '').toUpperCase()
  switch (status) {
    case 'SUCCESS':
    case 'REFUNDED':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'FAILED':
      return 'failed'
    case 'VOID':
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

/**
 * Build a canonical Refund. DOKU's refund response does not always echo the
 * charge id or amount the caller passed, so the adapter threads those through
 * `fallback`.
 */
export function transformRefund(
  raw: RawDokuRefund,
  fallback: { chargeId?: string; amount?: number } = {},
): Refund {
  const refundId =
    raw.refund?.id ?? raw.refund?.original_request_id ?? raw.transaction?.original_request_id ?? ''
  const amount =
    raw.refund?.amount != null ? toMinorUnits(raw.refund.amount) : (fallback.amount ?? 0)
  return {
    id: String(refundId || ''),
    externalId: String(refundId || ''),
    chargeId: String(raw.order?.invoice_number ?? fallback.chargeId ?? ''),
    amount,
    currency: pickCurrency(raw.order?.currency),
    status: mapStatus(raw),
    gateway: 'doku',
    metadata: strMap({
      reason: raw.refund?.reason,
      original_request_id: raw.transaction?.original_request_id,
    }),
    createdAt: toIsoDatetime(raw.refund?.date ?? raw.transaction?.date),
    updatedAt: toIsoDatetime(raw.refund?.date ?? raw.transaction?.date),
    raw,
  }
}
