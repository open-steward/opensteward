/**
 * Flipkart Returns → canonical Refund.
 *
 * Flipkart's Returns API surfaces return requests from buyers. Each
 * return has a return_id, order_item_id, and status. Refund amounts
 * are calculated from the selling price of the returned item.
 *
 * Refund id format: the Flipkart return_id is used directly.
 *
 * Docs: https://seller.flipkart.com/api-docs/order-api-docs/OMAPIRef.html
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'

export interface RawFlipkartReturn {
  return_id: string
  order_id: string
  order_item_id: string
  sku_id?: string
  listing_id?: string
  quantity: number
  reason?: string
  sub_reason?: string
  return_type?: string
  status?: string
  refund_amount?: {
    amount: number
    currency_code: string
  }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapRefundLineItem(
  raw: RawFlipkartReturn,
): RefundLineItem {
  return {
    lineItemId: raw.order_item_id,
    quantity: raw.quantity,
    amount: raw.refund_amount
      ? { amount: raw.refund_amount.amount, currency: raw.refund_amount.currency_code }
      : undefined,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawFlipkartReturn): Refund {
  const amount = raw.refund_amount
    ? { amount: raw.refund_amount.amount, currency: raw.refund_amount.currency_code }
    : undefined

  return {
    id: raw.return_id,
    orderId: raw.order_id,
    amount,
    reason: [raw.reason, raw.sub_reason].filter(Boolean).join(' — ') || undefined,
    refundLineItems: [mapRefundLineItem(raw)],
    processedAt: raw.updated_at,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
