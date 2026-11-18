/**
 * JTL-Shop Refund (Rückerstattung) → canonical Refund.
 *
 * JTL-Shop refunds are nested under orders at `/api/v1/orders/{id}/refunds`.
 * Key fields:
 *  - `id`, `orderId`
 *  - `amount` — decimal gross refund amount
 *  - `currency` — ISO 4217
 *  - `reason` string
 *  - `note` string
 *  - `items` array ({lineItemId, quantity, amount})
 *  - `restock` boolean
 *  - `created` — ISO 8601 timestamp
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw JTL-Shop shapes ───────────────────────────────────────────────────────

export interface RawJtlShopRefundItem {
  lineItemId?: number | string | null
  quantity?: number | null
  /** Decimal gross refund amount for this line */
  amount?: number | string | null
  [key: string]: unknown
}

export interface RawJtlShopRefund {
  id: number | string
  orderId?: number | string | null
  /** Decimal gross total refund amount */
  amount?: number | string | null
  currency?: string | null
  reason?: string | null
  note?: string | null
  restock?: boolean
  items?: RawJtlShopRefundItem[]
  created?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapRefundLineItems(
  raw: RawJtlShopRefundItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.lineItemId != null ? String(li.lineItemId) : '',
    quantity: li.quantity ?? 0,
    amount:
      li.amount != null
        ? { amount: majorToMinor(toNum(li.amount), currency), currency }
        : undefined,
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawJtlShopRefund, orderId: string): Refund {
  const currency = raw.currency ?? 'EUR'
  const rawAmount = raw.amount != null ? toNum(raw.amount) : null
  return {
    id: String(raw.id),
    orderId: raw.orderId != null ? String(raw.orderId) : orderId,
    amount:
      rawAmount != null && rawAmount > 0
        ? { amount: majorToMinor(rawAmount, currency), currency }
        : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    restock: raw.restock,
    refundLineItems: mapRefundLineItems(raw.items, currency),
    createdAt: raw.created ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → JTL-Shop refund body (for create). */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    reason: refund.reason,
    note: refund.note,
    restock: refund.restock,
    items: refund.refundLineItems?.map((li) => ({
      lineItemId: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
