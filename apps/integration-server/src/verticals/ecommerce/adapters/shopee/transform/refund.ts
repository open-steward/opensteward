/**
 * Shopee return → canonical Refund.
 *
 * Shopee models buyer refund/return requests under the Returns API. Each return
 * has a `return_sn`, an `order_sn`, a `refund_amount`, and line items.
 *
 * API: GET /api/v2/returns/get_return_list
 *      GET /api/v2/returns/get_return_detail
 * Docs: https://open.shopee.com/documents (Returns module)
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawShopeeReturnItem {
  /** Item ID. */
  item_id?: number
  /** Model ID (variant). */
  model_id?: number
  /** Item name. */
  name?: string
  /** Quantity in the return. */
  amount?: number
  /** Unit price of item. */
  item_price?: number
  /** Per-item refund amount (partial qty returns). */
  refund_amount?: number
  [key: string]: unknown
}

export interface RawShopeeReturn {
  /** Return serial number — unique identifier. */
  return_sn: string
  /** Associated order serial number. */
  order_sn?: string
  /** Refund amount in major currency units. */
  refund_amount?: number
  /** ISO 4217 currency code. */
  currency?: string
  /** Buyer-provided reason code string. */
  reason?: string
  /** Buyer-provided text reason. */
  text_reason?: string
  /** Unix timestamp of when the return was created. */
  create_time?: number
  /** Unix timestamp of when the return was last updated. */
  update_time?: number
  /** Return status, e.g. REQUESTED, PROCESSING, COMPLETED, CANCELLED. */
  status?: string
  /** Items included in this return. */
  item?: RawShopeeReturnItem[]
  /** Whether returned items need to be shipped back. */
  needs_logistics?: boolean
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapLineItem(
  raw: RawShopeeReturnItem,
  currency: string,
): RefundLineItem {
  const qty = raw.amount ?? 1
  const unitAmount =
    raw.refund_amount != null
      ? raw.refund_amount
      : raw.item_price != null
        ? raw.item_price * qty
        : undefined

  return {
    lineItemId: raw.item_id != null ? String(raw.item_id) : '0',
    quantity: qty,
    amount:
      unitAmount != null
        ? { amount: majorToMinor(unitAmount, currency), currency }
        : undefined,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawShopeeReturn): Refund {
  const currency = raw.currency ?? 'USD'
  const lineItems = (raw.item ?? []).map((li) => mapLineItem(li, currency))

  return {
    id: raw.return_sn,
    orderId: raw.order_sn ?? '',
    amount:
      raw.refund_amount != null
        ? { amount: majorToMinor(raw.refund_amount, currency), currency }
        : undefined,
    reason: raw.reason,
    note: raw.text_reason,
    restock: raw.needs_logistics === false, // If no logistics needed, items are not being returned
    refundLineItems: lineItems.length > 0 ? lineItems : undefined,
    transactionIds: undefined, // Not available in returns response
    processedAt:
      raw.update_time != null
        ? new Date(raw.update_time * 1000).toISOString()
        : undefined,
    createdAt:
      raw.create_time != null
        ? new Date(raw.create_time * 1000).toISOString()
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
