/**
 * Haravan Refund → canonical Refund.
 *
 * Docs: https://docs.haravan.com/docs/omni-apis/refunds/
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'

export interface RawHaravanRefundLineItem {
  id: number | string
  line_item_id: number | string
  quantity: number
  line_item?: { price?: number | string }
}

export interface RawHaravanRefund {
  id: number | string
  order_id: number | string
  note?: string | null
  user_id?: number | string
  location_id?: number | string | null
  refund_line_items?: RawHaravanRefundLineItem[]
  transactions?: Array<{ id: number | string }>
  created_at?: string
  [key: string]: unknown
}

function lineAmount(li: RawHaravanRefundLineItem): number | undefined {
  const price = li.line_item?.price
  if (price == null) return undefined
  const unit = typeof price === 'string' ? parseFloat(price) : price
  return unit * li.quantity
}

function mapRefundLineItems(
  raw: RawHaravanRefundLineItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => {
    const amount = lineAmount(li)
    return {
      lineItemId: String(li.line_item_id),
      quantity: li.quantity,
      amount: amount != null ? { amount, currency } : undefined,
    }
  })
}

/**
 * Haravan's Refund object has no top-level `amount` field (matching
 * Shopify's own shape) — the total is the sum of `refund_line_items`'
 * `line_item.price * quantity`, all real fields. When no line carries a
 * price, `amount` is left undefined rather than reported as 0.
 */
export function transformRefund(raw: RawHaravanRefund, currency: string): Refund {
  const refundLineItems = mapRefundLineItems(raw.refund_line_items, currency)
  const amounts = (raw.refund_line_items ?? []).map(lineAmount).filter((n): n is number => n != null)
  const totalAmount = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) : undefined

  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    amount: totalAmount != null ? { amount: totalAmount, currency } : undefined,
    note: raw.note ?? undefined,
    refundLineItems,
    transactionIds: raw.transactions?.map((t) => String(t.id)),
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    note: refund.note,
    refund_line_items: refund.refundLineItems?.map((li) => ({
      line_item_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
