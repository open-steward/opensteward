/**
 * Kaufland Marketplace return / order-unit refund → canonical Refund.
 *
 * Kaufland handles refunds at the order-unit level via
 * PATCH /order-units/{id}/refund. The API accepts an `amount` (in eurocents)
 * and a `reason`. Returns are tracked separately via /returns.
 *
 * We map each refund action to a canonical Refund using the order-unit id as
 * the refund id, scoped under the parent order id.
 *
 * Docs: https://sellerapi.kaufland.com/?page=managing-orders
 */

import type { Refund } from '../../../schema/refund'

// ── Raw Kaufland shapes ───────────────────────────────────────────────────────

/**
 * A Kaufland order-unit refund event or return item. The `amount` is already
 * in minor units (eurocents for EUR storefronts).
 */
export interface RawKauflandRefund {
  /** Unique refund / return identifier. */
  id_refund?: number | string | null
  /** The order-unit this refund applies to. */
  id_order_unit?: number | string | null
  /** The parent order id. */
  id_order?: string | null
  /** Refund amount in eurocents (integer minor units). */
  amount?: number | null
  /** Currency code. */
  currency?: string | null
  /** Seller-provided reason for the refund. */
  reason?: string | null
  /** Kaufland-assigned return reason (for return-based refunds). */
  return_reason?: string | null
  ts_created_iso?: string | null
  [key: string]: unknown
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformRefund(raw: RawKauflandRefund): Refund {
  const currency = raw.currency ?? 'EUR'
  const unitId = raw.id_order_unit != null ? String(raw.id_order_unit) : undefined
  const orderId = raw.id_order ?? (unitId ?? '')
  const refundId = raw.id_refund != null ? String(raw.id_refund) : (unitId ?? orderId)

  return {
    id: refundId,
    orderId: String(orderId),
    amount:
      raw.amount != null
        ? { amount: raw.amount, currency }
        : undefined,
    reason: raw.reason ?? raw.return_reason ?? undefined,
    refundLineItems: unitId
      ? [{ lineItemId: unitId, quantity: 1 }]
      : undefined,
    createdAt: raw.ts_created_iso ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build the PATCH /order-units/{id}/refund request body.
 * amount (eurocents) and reason are required by Kaufland.
 */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    amount: refund.amount?.amount ?? 0,
    reason: refund.reason ?? '',
  }
}
