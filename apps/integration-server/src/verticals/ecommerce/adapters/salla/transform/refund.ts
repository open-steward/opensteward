/**
 * Salla Refund → canonical Refund.
 *
 * Salla surfaces refund information via the order's `amounts.refunded` field
 * and through order status events (order.refunded). The dedicated refund
 * objects include:
 *  - id, order_id, amount (Price), reason, created_at
 *
 * The structure here models the expected refund resource shape from Salla's
 * API (the endpoint may be at /admin/v2/orders/{id}/refunds or embedded in
 * the order detail).
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

export interface RawSallaRefundAmount {
  amount: number
  currency: string
}

export interface RawSallaRefund {
  id: number | string
  order_id?: number | string | null
  amount?: RawSallaRefundAmount
  reason?: string | null
  note?: string | null
  created_at?: string | null
  [key: string]: unknown
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformRefund(raw: RawSallaRefund): Refund {
  const currency = raw.amount?.currency ?? 'SAR'

  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : '',
    amount: raw.amount
      ? {
          amount: majorToMinor(raw.amount.amount, currency),
          currency,
        }
      : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Salla refund body (for create). */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    reason: refund.reason,
    note: refund.note,
    amount: refund.amount ? minorToMajor(refund.amount.amount, refund.amount.currency) : undefined,
  }
}
