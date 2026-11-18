/**
 * Magento Credit Memo → canonical Refund.
 *
 * Magento represents refunds as credit memos (`/V1/creditmemos`). Each
 * credit memo carries:
 *  - `order_id` — stringified into canonical `orderId`.
 *  - `subtotal` / `base_grand_total` — total refund amount.
 *  - `items[]` — each with `order_item_id` + `qty` + `row_total`.
 *
 * Credit memos are usually created via `POST /V1/order/{orderId}/refund`
 * (the online-refund endpoint) which accepts:
 *
 *   { items: [{order_item_id, qty}],
 *     arguments: { shipping_amount, adjustment_positive, adjustment_negative } }
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMagentoCreditMemoItem {
  entity_id?: number
  parent_id?: number
  order_item_id: number
  qty: number
  sku?: string
  name?: string
  price?: number
  row_total?: number
  discount_amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface RawMagentoCreditMemo {
  entity_id: number
  order_id: number
  increment_id?: string
  state?: number
  subtotal?: number
  grand_total?: number
  base_grand_total?: number
  base_currency_code?: string
  order_currency_code?: string
  shipping_amount?: number
  tax_amount?: number
  discount_amount?: number
  adjustment?: number
  adjustment_positive?: number
  adjustment_negative?: number
  items?: RawMagentoCreditMemoItem[]
  comments?: Array<{ comment?: string; is_customer_notified?: number }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapLineItems(
  raw: RawMagentoCreditMemoItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((it) => ({
    lineItemId: String(it.order_item_id),
    quantity: it.qty,
    amount:
      it.row_total != null ? { amount: majorToMinor(it.row_total, currency), currency } : undefined,
  }))
}

export function transformRefund(raw: RawMagentoCreditMemo): Refund {
  const currency = raw.order_currency_code ?? raw.base_currency_code ?? 'USD'
  const amount = raw.grand_total ?? raw.base_grand_total
  const firstComment = raw.comments?.[0]?.comment
  return {
    id: String(raw.entity_id),
    orderId: String(raw.order_id),
    amount: amount != null ? { amount: majorToMinor(amount, currency), currency } : undefined,
    note: firstComment ?? undefined,
    restock: false,
    refundLineItems: mapLineItems(raw.items, currency),
    processedAt: toIsoDatetime(raw.created_at),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    items: refund.refundLineItems?.map((li) => ({
      order_item_id: Number(li.lineItemId),
      qty: li.quantity,
    })),
    arguments: {
      shipping_amount: 0,
      adjustment_positive: 0,
      adjustment_negative: 0,
    },
    notify: false,
  }
}
