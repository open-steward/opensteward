/**
 * Zid Refund → canonical Refund.
 *
 * Zid does not expose a dedicated refund listing endpoint in the documented
 * Merchant API. Refund status is surfaced on orders via `payment_status:
 * "refunded"`. The payment invoice array on the order contains line items
 * that can represent credit notes.
 *
 * We construct a minimal Refund from the order's payment invoice when the
 * payment_status is "refunded", treating the entire order total as the
 * refunded amount.
 *
 * Zid's Partner API does support a credit-note endpoint; if that becomes
 * available via OAuth the full list can be fetched there.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import type { RawZidOrder } from './order'

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/**
 * Build a Refund from a Zid order whose payment_status is "refunded".
 * The id is synthesised as `refund:{orderId}`.
 */
export function transformRefund(raw: RawZidOrder): Refund {
  const currency = raw.currency_code ?? 'SAR'
  const total = toNum(raw.order_total)

  return {
    id: `refund:${String(raw.id ?? '')}`,
    orderId: String(raw.id ?? ''),
    amount:
      total > 0
        ? { amount: majorToMinor(total, currency), currency }
        : undefined,
    processedAt: raw.updated_at,
    createdAt: raw.updated_at ?? raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Zid refund request body (minimal). */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    order_id: refund.orderId,
    note: refund.note,
  }
}
