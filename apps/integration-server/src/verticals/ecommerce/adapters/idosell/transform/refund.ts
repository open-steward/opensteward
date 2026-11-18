/**
 * IdoSell return → canonical Refund.
 *
 * Shape verified against the raw OpenAPI fragment embedded in
 * https://idosell.readme.io/reference/returnsreturnsget (`GET
 * /returns/returns`, response wraps rows in `returns[]` with
 * `results_number_all` / `results_page` / `results_limit` — snake_case,
 * unlike every other list endpoint on this platform) and
 * https://idosell.readme.io/reference/returnsreturnspost-1 (`POST
 * /returns/returns`, create; responds `{ return_id }` only, no full return
 * body, so the adapter re-fetches by id afterwards).
 *
 * No top-level refund total is documented on the return object — only a
 * per-product `price` — so `Refund.amount` is left undefined rather than
 * summed from an assumption about what `price` multiplies against.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawIdosellReturnProduct {
  id: number | string
  quantity?: number
  price?: number
}

export interface RawIdosellReturn {
  id: number | string
  order_sn: number | string
  products?: RawIdosellReturnProduct[]
  date_add?: string
  date_last_edit?: string
  currency?: string
  userNote?: string
  clientNote?: string
}

/** `lineItemId` and `quantity` are required — a row missing `quantity` is dropped. */
function mapRefundLineItems(
  products: RawIdosellReturnProduct[] | undefined,
  currency: string | undefined,
): RefundLineItem[] | undefined {
  if (!products || products.length === 0) return undefined
  const out: RefundLineItem[] = []
  for (const p of products) {
    if (p.quantity == null) continue
    out.push({
      lineItemId: String(p.id),
      quantity: p.quantity,
      amount: currency && p.price != null ? { amount: majorToMinor(p.price, currency), currency } : undefined,
    })
  }
  return out.length > 0 ? out : undefined
}

export function transformRefund(raw: RawIdosellReturn): Refund {
  const currency = raw.currency?.toUpperCase()
  return {
    id: String(raw.id),
    orderId: String(raw.order_sn),
    note: raw.clientNote || raw.userNote || undefined,
    refundLineItems: mapRefundLineItems(raw.products, currency),
    processedAt: toIsoDatetime(raw.date_last_edit),
    createdAt: toIsoDatetime(raw.date_add),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Refund → `POST /returns/returns` body (returnsreturnspost-1).
 * A product row missing `quantity` is dropped rather than sent with an
 * invented one.
 */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  const products = (refund.refundLineItems ?? [])
    .filter((li) => li.quantity != null)
    .map((li) => ({
      id: Number(li.lineItemId),
      quantity: li.quantity,
    }))
  return {
    order_sn: refund.orderId != null ? Number(refund.orderId) : undefined,
    products,
  }
}
