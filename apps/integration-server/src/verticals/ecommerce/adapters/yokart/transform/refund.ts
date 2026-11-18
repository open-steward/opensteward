/**
 * Yo!Kart Refund → canonical Refund.
 *
 * Yo!Kart processes refunds through the order management system. Refund
 * records carry the parent order id, a reason string, and the refunded
 * amount. There is no native restock flag so we default to `false`.
 *
 * Key field mapping:
 *  - `refund_id`          → id
 *  - `order_id`           → orderId
 *  - `refund_amount`      → amount (decimal major unit → minor units)
 *  - `refund_reason`      → reason
 *  - `refund_date`        → createdAt / processedAt
 *
 * Yo!Kart refund API paths:
 *   GET /admin/orders/refunds/{orderId}  → list refunds for an order
 *   GET /admin/refunds/view/{id}         → single refund detail
 *   POST /admin/refunds/add              → create refund
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw Yo!Kart shapes ────────────────────────────────────────────────────────

export interface RawYokartRefund {
  refund_id: number | string
  order_id?: number | string
  refund_amount?: string | number | null
  refund_reason?: string | null
  refund_note?: string | null
  refund_status?: string | number
  refund_date?: string
  refund_currency?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformRefund(
  raw: RawYokartRefund,
  orderId: string,
  currency: string = 'USD',
): Refund {
  const cur = (raw.refund_currency as string | undefined) ?? currency
  const rawAmount = raw.refund_amount != null ? toNum(raw.refund_amount) : undefined
  const amount =
    rawAmount != null ? majorToMinor(Math.abs(rawAmount), cur) : undefined

  return {
    id: String(raw.refund_id),
    orderId,
    amount: amount != null ? { amount, currency: cur } : undefined,
    reason: raw.refund_reason ?? undefined,
    note: raw.refund_note ?? undefined,
    restock: false,
    processedAt: toIsoDatetime(raw.refund_date),
    createdAt: toIsoDatetime(raw.refund_date),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  const currency = refund.amount?.currency
  return {
    order_id: refund.orderId,
    // Convert minor units back to decimal major for Yo!Kart (currency-aware).
    refund_amount:
      refund.amount?.amount != null
        ? minorToMajor(refund.amount.amount, currency)?.toString()
        : undefined,
    refund_reason: refund.reason,
    refund_note: refund.note,
  }
}
