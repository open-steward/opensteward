/**
 * BetterCommerce Return/Refund → canonical Refund.
 *
 * BetterCommerce uses `/api/v2/commerce/return` for return requests.
 *
 * Field mapping:
 *  returnId / recordId  → id
 *  orderId              → orderId
 *  refundAmount / amount → amount (major → minor)
 *  reason / notes       → note
 *  items / lineItems    → refundLineItems
 *  refundDate / createdAt → processedAt / createdAt
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawBCReturnLineItem {
  lineItemId?: string
  recordId?: string
  qty?: number
  quantity?: number
  refundAmount?: number | string | null
  amount?: number | string | null
  [key: string]: unknown
}

export interface RawBCRefund {
  returnId?: string
  recordId?: string
  orderId?: string
  refundAmount?: number | string | null
  amount?: number | string | null
  currencyCode?: string
  currency?: string
  reason?: string | null
  notes?: string | null
  items?: RawBCReturnLineItem[]
  lineItems?: RawBCReturnLineItem[]
  refundDate?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapRefundLineItems(
  raw: RawBCReturnLineItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.lineItemId ?? li.recordId ?? '',
    quantity: li.qty ?? li.quantity ?? 1,
    amount:
      li.refundAmount != null || li.amount != null
        ? {
            amount: majorToMinor(toNum(li.refundAmount ?? li.amount), currency),
            currency,
          }
        : undefined,
    metadata: li as unknown as Record<string, unknown>,
  }))
}

export function transformRefund(raw: RawBCRefund, orderId?: string): Refund {
  const currency = raw.currencyCode ?? raw.currency ?? 'GBP'
  const totalNum = toNum(raw.refundAmount ?? raw.amount)
  const items = raw.items ?? raw.lineItems

  return {
    id: raw.returnId ?? raw.recordId ?? '',
    orderId: raw.orderId ?? orderId ?? '',
    amount:
      totalNum > 0
        ? { amount: majorToMinor(totalNum, currency), currency }
        : undefined,
    note: raw.reason ?? raw.notes ?? undefined,
    refundLineItems: mapRefundLineItems(items, currency),
    processedAt: raw.refundDate ?? raw.createdAt,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → BetterCommerce return body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    orderId: refund.orderId,
    reason: refund.note,
    items: refund.refundLineItems?.map((li) => ({
      lineItemId: li.lineItemId,
      qty: li.quantity,
    })),
  }
}
