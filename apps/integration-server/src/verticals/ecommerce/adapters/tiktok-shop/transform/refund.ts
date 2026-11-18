/**
 * TikTok Shop return → canonical Refund.
 *
 * TikTok Shop exposes buyer-initiated returns through the Return & Refund API.
 * Returns include the originating order, affected line items, and refund amounts.
 *
 * Endpoint: POST /return_refund/202309/returns/search
 * Docs: https://partner.tiktokshop.com/docv2/page/return-refund-and-cancel-api-overview
 *
 * Return statuses (from TikTok documentation):
 *   RETURN_REQUEST_PENDING — submitted by buyer, awaiting seller action
 *   SELLER_APPROVED        — seller accepted the return
 *   SELLER_REJECTED        — seller rejected, may be escalated
 *   COMPLETED              — return and refund fully processed
 *   CLOSED                 — return closed without refund
 *   PROCESSING             — refund in progress
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTikTokReturnLineItem {
  id?: string
  order_line_item_id?: string
  quantity?: number
  refund_amount?: string
  currency?: string
  [key: string]: unknown
}

export interface RawTikTokReturn {
  id: string
  order_id?: string
  return_status?: string
  reason?: string
  reason_text?: string
  refund_amount?: string
  currency?: string
  line_items?: RawTikTokReturnLineItem[]
  create_time?: number
  update_time?: number
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapRefundLineItems(
  items: RawTikTokReturnLineItem[] | undefined,
  fallbackCurrency: string,
): RefundLineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items.map((li) => {
    const currency = li.currency ?? fallbackCurrency
    const amt = li.refund_amount ? Number(li.refund_amount) : undefined
    return {
      lineItemId: li.order_line_item_id ?? li.id ?? 'unknown',
      quantity: li.quantity ?? 1,
      amount:
        amt != null
          ? { amount: majorToMinor(amt, currency), currency }
          : undefined,
    }
  })
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawTikTokReturn): Refund {
  const currency = raw.currency ?? 'USD'
  const totalAmt = raw.refund_amount ? Number(raw.refund_amount) : undefined
  const lineItems = mapRefundLineItems(raw.line_items, currency)

  return {
    id: raw.id,
    orderId: raw.order_id ?? '',
    amount:
      totalAmt != null
        ? { amount: majorToMinor(totalAmt, currency), currency }
        : undefined,
    reason: raw.reason ?? raw.reason_text ?? undefined,
    restock: undefined, // TikTok does not surface a restock flag on returns
    refundLineItems: lineItems,
    processedAt: raw.update_time
      ? new Date(raw.update_time * 1000).toISOString()
      : undefined,
    createdAt: raw.create_time
      ? new Date(raw.create_time * 1000).toISOString()
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
