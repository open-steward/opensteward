/**
 * Sapo Refund → canonical Refund.
 *
 * Sapo refund endpoints are scoped to orders:
 *   GET /admin/orders/{order_id}/refunds.json
 *
 * Sapo uses `created_on` / `processed_on` for timestamps (not `_at` suffix).
 * The `refund_line_items` structure mirrors Shopify's.
 *
 * Docs: https://support.sapo.vn/gioi-thieu-order-api
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawSapoRefundLineItem {
  line_item_id: number | string
  quantity: number
  subtotal?: string | number
  total_tax?: string | number
}

export interface RawSapoRefundTransaction {
  id: number | string
}

export interface RawSapoRefund {
  id: number | string
  order_id: number | string
  note?: string | null
  restock?: boolean
  refund_line_items?: RawSapoRefundLineItem[]
  transactions?: RawSapoRefundTransaction[]
  /** Sapo: `processed_on` */
  processed_on?: string | null
  /** Sapo: `created_on` */
  created_on?: string
  currency?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapRefundLineItems(
  raw: RawSapoRefundLineItem[] | undefined,
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

export function transformRefund(raw: RawSapoRefund, currency: string = 'VND'): Refund {
  const effectiveCurrency = raw.currency ?? currency
  const refundLineItems = mapRefundLineItems(raw.refund_line_items, effectiveCurrency)
  const totalAmount = raw.refund_line_items?.reduce((acc, li) => acc + toNum(li.subtotal), 0)
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    amount:
      totalAmount != null && totalAmount > 0
        ? {
            amount: majorToMinor(totalAmount, effectiveCurrency),
            currency: effectiveCurrency,
          }
        : undefined,
    note: raw.note ?? undefined,
    restock: raw.restock,
    refundLineItems,
    transactionIds: raw.transactions?.map((t) => String(t.id)),
    processedAt: raw.processed_on ?? undefined,
    createdAt: raw.created_on,
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
