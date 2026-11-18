/**
 * ikas Refund → canonical Refund.
 *
 * ikas exposes refunds via the `refundOrderLine` mutation. The mutation
 * accepts an `OrderRefundInput` and returns an updated Order with a
 * refund summary. ikas does not provide a separate `listRefunds` query;
 * refund data is embedded in the order response.
 *
 * Docs: https://ikas.dev/docs/api/admin-api/orders
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw ikas shapes ───────────────────────────────────────────────────────────

export interface RawIkasRefundLineItem {
  orderLineItemId?: string | null
  quantity?: number | null
  refundAmount?: number | null
}

export interface RawIkasRefund {
  id: string
  orderId?: string | null
  refundLineItems?: RawIkasRefundLineItem[] | null
  totalRefundAmount?: number | null
  note?: string | null
  currency?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapRefundLineItems(
  raw: RawIkasRefundLineItem[] | null | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw
    .filter((li) => li.orderLineItemId != null)
    .map((li) => ({
      lineItemId: li.orderLineItemId!,
      quantity: li.quantity ?? 1,
      amount:
        li.refundAmount != null && li.refundAmount > 0
          ? { amount: majorToMinor(li.refundAmount, currency), currency }
          : undefined,
    }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawIkasRefund): Refund {
  const currency = raw.currency ?? 'TRY'
  return {
    id: raw.id,
    orderId: raw.orderId ?? '',
    amount:
      raw.totalRefundAmount != null && raw.totalRefundAmount > 0
        ? { amount: majorToMinor(raw.totalRefundAmount, currency), currency }
        : undefined,
    note: raw.note ?? undefined,
    refundLineItems: mapRefundLineItems(raw.refundLineItems, currency),
    createdAt: raw.createdAt ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → ikas `OrderRefundInput`. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    orderId: refund.orderId,
    note: refund.note,
    lines: refund.refundLineItems?.map((li) => ({
      orderLineItemId: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
