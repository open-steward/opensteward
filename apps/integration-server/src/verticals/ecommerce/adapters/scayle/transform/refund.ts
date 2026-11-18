/**
 * SCAYLE Cancellation / ReturnItem → canonical Refund.
 *
 * SCAYLE models refunds as "cancellations" for in-flight items and
 * "return items" for delivered goods. Both result in credit notes (refunds).
 *
 * The SCAYLE Admin API CancellationService exposes:
 *  - POST /cancellations     — create a cancellation
 *  - GET  /cancellations/{id} — retrieve a cancellation
 *
 * Cancellation fields:
 *  - id (int), orderId (int), reason, items[] { orderItemId, quantity, amount (minor-unit int) },
 *    createdAt, updatedAt
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'

// ── Raw SCAYLE shapes (minimal) ──────────────────────────────────────────────

export interface RawScayleCancellationItem {
  orderItemId?: number | string
  quantity?: number | null
  /** Amount in minor units (integer cents). */
  amount?: number | null
  currency?: string
}

export interface RawScayleCancellation {
  id: number | string
  orderId?: number | string | null
  orderReferenceKey?: string | null
  reason?: string | null
  note?: string | null
  items?: RawScayleCancellationItem[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapRefundLineItems(
  items: RawScayleCancellationItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items.map((item) => ({
    lineItemId: String(item.orderItemId ?? ''),
    quantity: item.quantity ?? 1,
    // SCAYLE amounts are already in minor units.
    amount:
      item.amount != null
        ? { amount: item.amount, currency: item.currency ?? currency }
        : undefined,
  }))
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawScayleCancellation, currency: string = 'EUR'): Refund {
  const refundLineItems = mapRefundLineItems(raw.items, currency)

  // Total amount as sum of item amounts (all already in minor units).
  const totalAmount = raw.items?.reduce((acc, item) => acc + (item.amount ?? 0), 0)

  return {
    id: String(raw.id),
    orderId: raw.orderId != null ? String(raw.orderId) : (raw.orderReferenceKey ?? ''),
    amount:
      totalAmount != null && totalAmount > 0
        ? { amount: totalAmount, currency }
        : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    refundLineItems,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → SCAYLE cancellation body (for create). */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    orderId: refund.orderId ? parseInt(refund.orderId, 10) || refund.orderId : undefined,
    reason: refund.reason,
    note: refund.note,
    items: refund.refundLineItems?.map((li) => ({
      orderItemId: parseInt(li.lineItemId, 10) || li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
