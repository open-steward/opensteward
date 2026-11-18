/**
 * Thirty Bees Order Return → canonical Refund.
 *
 * Thirty Bees (PrestaShop 1.6 fork) calls refunds "order returns" and exposes
 * them via `/api/order_returns`. Each return is linked to an order via
 * `id_order` and carries a `state` (1 = Waiting, 2 = Waiting, 3 = Return
 * received, 4 = Return denied, 5 = Return completed).
 *
 * The associated order-return products are in `associations.order_return_detail`.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Thirty Bees shape ───────────────────────────────────────────────────

export interface RawThirtyBeesOrderReturnDetail {
  id?: number | string
  id_order_detail?: number | string
  product_quantity?: number | string
  [key: string]: unknown
}

export interface RawThirtyBeesOrderReturn {
  id: number | string
  id_order?: number | string | null
  id_customer?: number | string | null
  state?: number | string | null
  question?: string | null
  date_add?: string | null
  date_upd?: string | null
  associations?: {
    order_return_detail?: RawThirtyBeesOrderReturnDetail[]
  }
  [key: string]: unknown
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformRefund(raw: RawThirtyBeesOrderReturn): Refund {
  const lineItems: RefundLineItem[] = (
    raw.associations?.order_return_detail ?? []
  ).map((d) => ({
    lineItemId: d.id_order_detail != null ? String(d.id_order_detail) : String(d.id ?? ''),
    quantity:
      d.product_quantity != null
        ? parseInt(String(d.product_quantity), 10) || 1
        : 1,
  }))

  return {
    id: String(raw.id),
    orderId: raw.id_order != null ? String(raw.id_order) : '',
    reason: raw.question ?? undefined,
    refundLineItems: lineItems.length > 0 ? lineItems : undefined,
    processedAt: toIsoDatetime(raw.date_add),
    createdAt: toIsoDatetime(raw.date_add),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
