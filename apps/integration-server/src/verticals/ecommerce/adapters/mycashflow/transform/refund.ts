/**
 * MyCashflow Refund → canonical Refund.
 *
 * MyCashflow does not expose a standalone `/refunds` resource in its v1 REST
 * API. Returns/refunds are handled via order payment status changes in the
 * admin UI. This transform covers the minimum shape needed if a refund-like
 * object is surfaced on an order (e.g. via the `payment_status: "refunded"`
 * field or a sub-resource added in future API versions).
 *
 * The `orderId` must be passed in by the caller since refund objects do not
 * always carry it inline.
 *
 * Docs: https://support.mycashflow.com/api/11-orders/
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawMyCashflowRefundRow {
  id: number | string
  order_row_id?: number | string | null
  quantity?: number
  amount?: number | null
  [key: string]: unknown
}

export interface RawMyCashflowRefund {
  id: number | string
  order_id?: number | string | null
  amount?: number | null
  reason?: string | null
  note?: string | null
  restock?: boolean
  rows?: RawMyCashflowRefundRow[]
  created_at?: string
  updated_at?: string
  currency?: string
  [key: string]: unknown
}

function mapRefundLineItems(
  rows: RawMyCashflowRefundRow[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!rows || rows.length === 0) return undefined
  return rows.map((r) => ({
    lineItemId: r.order_row_id != null ? String(r.order_row_id) : String(r.id),
    quantity: r.quantity ?? 1,
    amount:
      r.amount != null
        ? { amount: majorToMinor(r.amount, currency), currency }
        : undefined,
  }))
}

export function transformRefund(
  raw: RawMyCashflowRefund,
  orderId: string,
  currency: string = 'EUR',
): Refund {
  const cur = raw.currency ?? currency
  const amount =
    raw.amount != null ? majorToMinor(Math.abs(raw.amount), cur) : undefined
  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : orderId,
    amount: amount != null ? { amount, currency: cur } : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    restock: raw.restock ?? false,
    refundLineItems: mapRefundLineItems(raw.rows, cur),
    processedAt: raw.created_at,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
