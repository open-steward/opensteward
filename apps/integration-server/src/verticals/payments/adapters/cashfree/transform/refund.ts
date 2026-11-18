import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Cashfree refund object (`POST /orders/{order_id}/refunds`,
 * `GET /orders/{order_id}/refunds/{refund_id}`). `refund_id` is the
 * merchant-assigned id; `cf_refund_id` is Cashfree's. The canonical
 * `chargeId` is the order id (Cashfree refunds are scoped to an order, not
 * a single payment, though `cf_payment_id` is echoed back).
 */
export interface RawCashfreeRefund {
  cf_refund_id?: string | number
  cf_payment_id?: string | number
  refund_id?: string
  order_id?: string
  refund_amount?: number | string
  refund_currency?: string
  refund_note?: string | null
  refund_status?: string
  refund_type?: string
  refund_arn?: string | null
  status_description?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string
  processed_at?: string
  [k: string]: unknown
}

function mapStatus(raw: string): RefundStatus {
  switch (raw.toUpperCase()) {
    case 'SUCCESS':
      return 'succeeded'
    case 'PENDING':
    case 'ONHOLD':
      return 'pending'
    case 'CANCELLED':
      return 'cancelled'
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawCashfreeRefund): Refund {
  const id = String(raw.cf_refund_id ?? raw.refund_id ?? '')
  return {
    id,
    externalId: id,
    chargeId: String(raw.order_id ?? raw.cf_payment_id ?? ''),
    amount: toMinorUnits(raw.refund_amount),
    currency: pickCurrency(raw.refund_currency),
    status: mapStatus(String(raw.refund_status ?? '')),
    failureReason: raw.status_description ?? undefined,
    gateway: 'cashfree',
    metadata: strMap({
      refund_id: raw.refund_id,
      cf_payment_id: raw.cf_payment_id,
      refund_type: raw.refund_type,
      refund_arn: raw.refund_arn,
      refund_note: raw.refund_note,
      ...raw.metadata,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.processed_at ?? raw.created_at),
    raw,
  }
}
