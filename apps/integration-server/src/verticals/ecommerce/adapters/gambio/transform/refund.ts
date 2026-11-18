/**
 * WooCommerce Refund → canonical Refund.
 *
 * Refunds are nested under orders in WC (`/orders/{id}/refunds`). The
 * refund object carries a top-level `amount` string, a `reason` string,
 * and a `line_items` array with `quantity` + `total`. WC has no
 * restock flag on the refund object, so we always set `restock: false`.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawWooCommerceRefundLineItem {
  id: number | string
  quantity: number
  total?: string | number
  total_tax?: string | number
  refund_total?: number
  [key: string]: unknown
}

export interface RawWooCommerceRefund {
  id: number | string
  /**
   * WooCommerce returns the parent order id inline on the refund object
   * since WC 3.x (`parent_id`). Some older shapes omit it, so we also
   * accept it being set by the adapter before passing into the transform.
   */
  parent_id?: number | string
  amount?: string | number
  reason?: string | null
  refunded_by?: number
  refunded_payment?: boolean
  line_items?: RawWooCommerceRefundLineItem[]
  date_created?: string
  date_created_gmt?: string
  currency?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapRefundLineItems(
  raw: RawWooCommerceRefundLineItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: String(li.id),
    // WC refund line items quantity is returned as a negative number —
    // take the absolute value to match the canonical shape.
    quantity: Math.abs(li.quantity),
    amount:
      li.total != null
        ? { amount: majorToMinor(Math.abs(toNum(li.total)), currency), currency }
        : undefined,
  }))
}

export function transformRefund(
  raw: RawWooCommerceRefund,
  orderId: string,
  currency: string = 'USD',
): Refund {
  const cur = raw.currency ?? currency
  const amount =
    raw.amount != null ? majorToMinor(Math.abs(toNum(raw.amount)), cur) : undefined
  return {
    id: String(raw.id),
    orderId,
    amount: amount != null ? { amount, currency: cur } : undefined,
    reason: raw.reason ?? undefined,
    // WC doesn't expose a restock field on refunds.
    restock: false,
    refundLineItems: mapRefundLineItems(raw.line_items, cur),
    processedAt: raw.date_created_gmt ?? raw.date_created,
    createdAt: raw.date_created_gmt ?? raw.date_created,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Money is integer minor units; WooCommerce expects decimal major. */
function minorToMajor(v: number | undefined): number | undefined {
  return v == null ? undefined : v / 100
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    amount: minorToMajor(refund.amount?.amount)?.toString(),
    reason: refund.reason,
    line_items: refund.refundLineItems?.map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
      refund_total: minorToMajor(li.amount?.amount),
    })),
  }
}
