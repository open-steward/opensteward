import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

/**
 * A PayU refund object, as returned inside the `refund` envelope by
 * `POST /api/v2_1/orders/{orderId}/refunds` and `GET .../refunds`.
 */
export interface RawPayuRefund {
  refundId?: string
  extRefundId?: string
  amount?: string | number
  currencyCode?: string
  status?: string
  statusDateTime?: string
  statusDatetime?: string
  reasonDescription?: string
  description?: string
  /** Attached by the adapter — PayU does not echo the order id on the refund. */
  orderId?: string
  [k: string]: unknown
}

/**
 * Map a PayU refund status to a canonical refund status.
 *   PENDING                   → pending
 *   FINALIZED                 → succeeded
 *   CANCELED                  → cancelled
 */
function mapStatus(raw: RawPayuRefund): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'FINALIZED':
      return 'succeeded'
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled'
    case 'PENDING':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawPayuRefund): Refund {
  const id = pickStr(raw.refundId) ?? pickStr(raw.extRefundId) ?? ''
  const meta: Record<string, unknown> = {
    extRefundId: raw.extRefundId,
    payuStatus: raw.status,
    reasonDescription: raw.reasonDescription ?? raw.description,
  }
  return {
    id,
    externalId: pickStr(raw.extRefundId) ?? id,
    chargeId: pickStr(raw.orderId) ?? '',
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currencyCode),
    status: mapStatus(raw),
    gateway: 'payu',
    metadata: strMap(meta),
    createdAt: toIsoDatetime(raw.statusDatetime ?? raw.statusDateTime),
    updatedAt: toIsoDatetime(raw.statusDatetime ?? raw.statusDateTime),
    raw,
  }
}

/**
 * Build a PayU refund-create body from a partial canonical refund.
 * PayU wraps the refund in a `refund` envelope; `amount` is optional (omit it
 * for a full refund).
 */
export function untransformRefund(r: Partial<Refund>): Record<string, unknown> {
  const refund: Record<string, unknown> = {
    description: r.metadata?.reasonDescription ?? 'Refund',
  }
  if (typeof r.amount === 'number' && r.amount > 0) {
    refund.amount = String(r.amount)
  }
  return { refund }
}
