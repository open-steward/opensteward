/**
 * Shopify Refund → canonical Refund.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawShopifyRefundLineItem {
  line_item_id: number | string
  quantity: number
  subtotal?: string | number
  total_tax?: string | number
}

export interface RawShopifyRefundTransaction {
  id: number | string
}

export interface RawShopifyRefund {
  id: number | string
  order_id: number | string
  note?: string | null
  restock?: boolean
  refund_line_items?: RawShopifyRefundLineItem[]
  transactions?: RawShopifyRefundTransaction[]
  processed_at?: string | null
  created_at?: string
  currency?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapRefundLineItems(
  raw: RawShopifyRefundLineItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: String(li.line_item_id),
    quantity: li.quantity,
    amount:
      li.subtotal != null
        ? { amount: majorToMinor(toNum(li.subtotal), currency), currency }
        : undefined,
  }))
}

export function transformRefund(raw: RawShopifyRefund, currency: string = 'USD'): Refund {
  const refundLineItems = mapRefundLineItems(raw.refund_line_items, raw.currency ?? currency)
  // Total amount as sum of refund_line_items subtotals (Shopify doesn't
  // surface a top-level refund amount on the refund object).
  const totalAmount = raw.refund_line_items?.reduce((acc, li) => acc + toNum(li.subtotal), 0)
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    amount:
      totalAmount != null && totalAmount > 0
        ? {
            amount: majorToMinor(totalAmount, raw.currency ?? currency),
            currency: raw.currency ?? currency,
          }
        : undefined,
    note: raw.note ?? undefined,
    restock: raw.restock,
    refundLineItems,
    transactionIds: raw.transactions?.map((t) => String(t.id)),
    processedAt: raw.processed_at ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    note: refund.note,
    notify: false,
    restock: refund.restock,
    refund_line_items: refund.refundLineItems?.map((li) => ({
      line_item_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
