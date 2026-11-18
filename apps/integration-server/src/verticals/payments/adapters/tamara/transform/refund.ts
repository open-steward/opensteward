import type { Refund } from '../../../schema/refund'
import { moneyFields, pickCurrency, strMap, toIsoDatetime, type TamaraMoney } from './shared'

/**
 * Tamara refund record. The simplified-refund endpoint
 * (`POST /payments/simplified-refund/{order_id}`) returns a single refund:
 * `refund_id`, `capture_id`, `order_id`, `status`, `comment`, and the running
 * `refunded_amount`. We also accept the per-refund rows nested under
 * `GET /orders/{order_id}` → `transactions.refunds`.
 *
 * Docs: https://docs.tamara.co/reference/simplifiedrefund
 */
export interface RawTamaraRefund {
  refund_id?: string
  capture_id?: string
  order_id?: string
  status?: string
  comment?: string
  merchant_refund_id?: string
  /** Running total refunded on the order after this refund. */
  refunded_amount?: TamaraMoney
  /** Per-refund line amount (nested order-details rows expose this). */
  total_amount?: TamaraMoney
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

/**
 * Tamara refund/order statuses: `fully_refunded` / `partially_refunded` on
 * success. A refund returned by the refund endpoint is, by construction, an
 * accepted refund, so an absent status is treated as success.
 */
function mapStatus(raw: RawTamaraRefund): Refund['status'] {
  switch (String(raw.status ?? '').toLowerCase()) {
    case 'fully_refunded':
    case 'partially_refunded':
    case 'refunded':
    case 'succeeded':
    case 'completed':
      return 'succeeded'
    case 'pending':
    case 'processing':
      return 'pending'
    case 'failed':
    case 'declined':
      return 'failed'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    default:
      return raw.status ? 'pending' : 'succeeded'
  }
}

export function transformRefund(raw: RawTamaraRefund): Refund {
  const money = moneyFields(raw.total_amount ?? raw.refunded_amount)
  const currency =
    pickCurrency(raw.total_amount?.currency ?? raw.refunded_amount?.currency) ?? 'SAR'
  const timestamp = toIsoDatetime(raw.updated_at ?? raw.created_at)

  return {
    id: String(raw.refund_id ?? ''),
    externalId: String(raw.refund_id ?? ''),
    chargeId: String(raw.order_id ?? ''),
    amount: money.amount,
    currency,
    status: mapStatus(raw),
    gateway: 'tamara',
    metadata: strMap({
      capture_id: raw.capture_id,
      comment: raw.comment,
      merchant_refund_id: raw.merchant_refund_id,
      tamara_status: raw.status,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: timestamp,
    raw,
  }
}
