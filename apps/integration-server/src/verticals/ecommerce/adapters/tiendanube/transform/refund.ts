/**
 * Tiendanube / Nuvemshop Refund → canonical Refund.
 *
 * Tiendanube does not expose a dedicated refund resource. Refunds are
 * initiated via the Transaction resource (event type "refund") and reflected
 * in `order.payment_status` becoming `refunded` or `partially_refunded`.
 *
 * This transform covers the shape used when a refund is embedded in an order
 * response or delivered via a webhook payload.
 *
 * Because there is no stable refund list/get endpoint, the adapter does NOT
 * expose `listRefunds`, `getRefund`, or `createRefund` — those remain 501.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTiendanubeRefundProduct {
  id?: number | string
  quantity?: number
  [key: string]: unknown
}

export interface RawTiendanubeRefund {
  id: number | string
  order_id?: number | string
  amount?: string | number | null
  currency?: string | null
  reason?: string | null
  note?: string | null
  restock?: boolean
  products?: RawTiendanubeRefundProduct[]
  transaction_id?: string | number | null
  created_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawTiendanubeRefund): Refund {
  const currency = raw.currency ?? 'USD'
  const rawAmount = toNum(raw.amount)

  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : '',
    amount:
      rawAmount > 0
        ? { amount: majorToMinor(rawAmount, currency), currency }
        : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    restock: raw.restock,
    refundLineItems: raw.products
      ?.filter((p) => p.id != null)
      .map((p) => ({
        lineItemId: String(p.id!),
        quantity: p.quantity ?? 0,
      })),
    transactionIds: raw.transaction_id != null ? [String(raw.transaction_id)] : undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
