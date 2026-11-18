/**
 * Conekta refunds are taken against an **order** (`POST /orders/{id}/refunds`)
 * and the response echoes the refunded order. The refund line lives in the
 * order's `charges[].refunds[]`; we read the most recent one. There is no
 * standalone refund list/get endpoint, so the adapter only implements
 * `createRefund` — the canonical id is the order id plus the refund id.
 *
 * The refund object fields: `id`, `object` (`cash_refund`/`card_refund`),
 * `amount`, `currency`, `status`, `reason`, `created_at` (epoch seconds).
 *
 * Ref: https://developers.conekta.com/reference/orderrefund
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundReason, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawConektaRefund {
  id?: string
  object?: string
  amount?: number
  currency?: string
  status?: string
  reason?: string
  reference?: string
  created_at?: number
  [k: string]: unknown
}

/** The refunded order echoed back by POST /orders/{id}/refunds. */
export interface RawConektaRefundedOrder {
  id?: string
  amount?: number
  amount_refunded?: number
  currency?: string
  charges?: {
    data?: Array<{ refunds?: RawConektaRefund[] } & Record<string, unknown>>
  }
  [k: string]: unknown
}

function mapStatus(raw: RawConektaRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'completed':
    case 'success':
    case 'refunded':
      return 'succeeded'
    case 'pending':
    case 'processing':
      return 'pending'
    case 'declined':
    case 'failed':
      return 'failed'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function mapReason(reason: string | undefined): RefundReason | undefined {
  switch ((reason ?? '').toLowerCase()) {
    case 'requested_by_client':
    case 'requested_by_customer':
      return 'requested_by_customer'
    case 'duplicated_transaction':
    case 'duplicate':
      return 'duplicate'
    case 'fraudulent':
      return 'fraudulent'
    case 'other':
      return 'other'
    default:
      return reason ? 'other' : undefined
  }
}

/**
 * Extract the freshest refund line + the order id from a refunded-order
 * payload. Returns `undefined` when no refund line is present (the caller
 * guarantees at least one on a successful POST).
 */
export function extractRefund(
  order: RawConektaRefundedOrder,
): { refund: RawConektaRefund; orderId: string; orderCurrency?: string } | undefined {
  const orderId = String(order.id ?? '')
  const charges = order.charges?.data ?? []
  let latest: RawConektaRefund | undefined
  for (const charge of charges) {
    for (const r of charge.refunds ?? []) {
      if (!latest || (r.created_at ?? 0) >= (latest.created_at ?? 0)) latest = r
    }
  }
  if (!latest) return undefined
  return { refund: latest, orderId, orderCurrency: order.currency }
}

export function transformRefund(
  raw: RawConektaRefund,
  orderId: string,
  orderCurrency?: string,
): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: orderId,
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency ?? orderCurrency),
    status: mapStatus(raw),
    reason: mapReason(raw.reason),
    gateway: 'conekta',
    metadata: strMap({ object: raw.object, reference: raw.reference }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
