/**
 * Bagisto Refund → canonical Refund.
 *
 * Bagisto creates refunds (credit memos) via the order's refund endpoint.
 * The API returns refund objects at `/api/v1/orders/{orderId}/refunds` or
 * the global `/api/v1/refunds` listing.
 *
 * Amounts are decimal strings in major units (e.g. "25.00").
 *
 * Docs: https://devdocs.bagisto.com/1.x/api/refunds.html
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface BagistoRefundItem {
  id: number | string
  order_item_id?: number | string | null
  quantity?: number | null
  price?: string | number | null
  total?: string | number | null
  [key: string]: unknown
}

export interface BagistoRefund {
  id: number | string
  order_id?: number | string | null
  state?: string | null
  adjustment_refund?: string | number | null
  adjustment_fee?: string | number | null
  base_adjustment_refund?: string | number | null
  grand_total?: string | number | null
  base_grand_total?: string | number | null
  sub_total?: string | number | null
  currency_code?: string | null
  items?: BagistoRefundItem[] | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'number' ? v : parseFloat(String(v))
}

function mapLineItems(items: BagistoRefundItem[] | null | undefined, currency: string): RefundLineItem[] {
  return (items ?? []).map((item) => ({
    lineItemId: String(item.order_item_id ?? item.id),
    quantity: item.quantity ?? 0,
    amount: item.total != null
      ? { amount: majorToMinor(toNum(item.total), currency), currency }
      : undefined,
  }))
}

export function transformRefund(raw: BagistoRefund, orderId?: string): Refund {
  const currency = raw.currency_code ?? 'USD'
  const total = toNum(raw.grand_total ?? raw.base_grand_total)
  return {
    id: String(raw.id),
    orderId: String(raw.order_id ?? orderId ?? ''),
    amount: total > 0 ? { amount: majorToMinor(total, currency), currency } : undefined,
    refundLineItems: mapLineItems(raw.items, currency),
    processedAt: raw.created_at ?? undefined,
    createdAt: raw.created_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(data: Partial<Refund>): Record<string, unknown> {
  return {
    refund_lines: (data.refundLineItems ?? []).map((li) => ({
      order_item_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
