/**
 * Shoper Return → canonical Refund.
 *
 * Shoper tracks returns under:
 *   GET /webapi/rest/order-returns[/{id}]
 *
 * Each return record links to an order and contains amount and reason
 * information.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

export interface RawShoperOrderReturn {
  return_id?: number | string
  order_id?: number | string | null
  /** Refund amount (decimal string). */
  amount?: string | number | null
  currency?: string | null
  reason?: string | null
  note?: string | null
  /** Whether stock is restocked. */
  restock?: boolean | number | null
  add_date?: string | null
  edit_date?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawShoperOrderReturn, fallbackOrderId?: string): Refund {
  const currency = raw.currency ?? 'PLN'
  const amount = toNum(raw.amount)

  return {
    id: String(raw.return_id ?? ''),
    orderId: String(raw.order_id ?? fallbackOrderId ?? ''),
    amount:
      amount > 0 ? { amount: majorToMinor(amount, currency), currency } : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    restock: raw.restock != null ? Boolean(raw.restock) : undefined,
    refundLineItems: undefined,
    transactionIds: undefined,
    processedAt: raw.add_date ?? undefined,
    createdAt: raw.add_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Shoper return body (for create). */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    order_id: refund.orderId,
    amount: minorToMajor(refund.amount?.amount, refund.amount?.currency),
    currency: refund.amount?.currency,
    reason: refund.reason,
    note: refund.note,
    restock: refund.restock ? 1 : 0,
  }
}
