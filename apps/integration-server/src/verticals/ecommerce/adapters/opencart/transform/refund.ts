/**
 * OpenCart Order History / Return → canonical Refund.
 *
 * OpenCart doesn't have a first-class refund object like WooCommerce.
 * Refunds are typically handled via order status changes (status 11 =
 * Refunded) and product returns. We model refunds as a synthetic
 * object built from order return data.
 *
 * Key mappings:
 *  - `return_id` → `id` (stringified)
 *  - `order_id` → `orderId`
 *  - `comment` → `reason`
 *  - Product returns carry per-item data.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawOpenCartReturnProduct {
  return_product_id?: number | string
  product_id?: number | string
  name?: string
  model?: string
  quantity?: number | string
  price?: string | number
  [key: string]: unknown
}

export interface RawOpenCartReturn {
  return_id: number | string
  order_id?: number | string
  customer_id?: number | string
  comment?: string | null
  return_status_id?: number | string
  return_status?: string
  products?: RawOpenCartReturnProduct[]
  total?: string | number
  date_added?: string
  date_modified?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapRefundLineItems(
  raw: RawOpenCartReturnProduct[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.return_product_id != null ? String(li.return_product_id) : String(li.product_id ?? ''),
    quantity: Math.abs(toNum(li.quantity)),
    amount:
      li.price != null
        ? { amount: majorToMinor(Math.abs(toNum(li.price)), currency), currency }
        : undefined,
  }))
}

export function transformRefund(
  raw: RawOpenCartReturn,
  orderId: string,
  currency: string = 'USD',
): Refund {
  const amount = raw.total != null ? Math.abs(toNum(raw.total)) : undefined
  return {
    id: String(raw.return_id),
    orderId,
    amount: amount != null ? { amount: majorToMinor(amount, currency), currency } : undefined,
    reason: raw.comment ?? undefined,
    restock: false,
    refundLineItems: mapRefundLineItems(raw.products, currency),
    processedAt: toIsoDatetime(raw.date_added),
    createdAt: toIsoDatetime(raw.date_added),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    order_id: refund.orderId,
    comment: refund.reason,
    products: refund.refundLineItems?.map((li) => ({
      product_id: li.lineItemId,
      quantity: li.quantity,
      price: li.amount?.amount,
    })),
  }
}
