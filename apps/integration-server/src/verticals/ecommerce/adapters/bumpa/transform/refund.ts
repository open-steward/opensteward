/**
 * Bumpa Refund → canonical Refund.
 *
 * Bumpa exposes refund records with an amount, reason, and associated
 * order id. The amount is a decimal major-unit value that we convert to
 * integer minor units via majorToMinor().
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawBumpaRefundLineItem {
  id?: number | string
  order_item_id?: number | string
  line_item_id?: number | string
  quantity?: number
  amount?: string | number
  subtotal?: string | number
  [key: string]: unknown
}

export interface RawBumpaRefund {
  id: number | string
  order_id: number | string
  amount?: string | number
  total?: string | number
  reason?: string | null
  note?: string | null
  restock?: boolean
  refund_items?: RawBumpaRefundLineItem[]
  line_items?: RawBumpaRefundLineItem[]
  processed_at?: string | null
  created_at?: string
  currency?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : 0
}

function mapRefundLineItems(
  raw: RawBumpaRefundLineItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => {
    const lineItemId = String(li.line_item_id ?? li.order_item_id ?? li.id ?? '')
    const subtotal = li.subtotal ?? li.amount
    return {
      lineItemId,
      quantity: li.quantity ?? 1,
      amount:
        subtotal != null
          ? { amount: majorToMinor(toNum(subtotal), currency), currency }
          : undefined,
    }
  })
}

export function transformRefund(raw: RawBumpaRefund, currency: string = 'NGN'): Refund {
  const effectiveCurrency = (raw.currency as string | undefined) ?? currency
  const rawAmount = raw.amount ?? raw.total
  const lineItems = mapRefundLineItems(
    raw.refund_items ?? raw.line_items,
    effectiveCurrency,
  )

  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    amount:
      rawAmount != null
        ? {
            amount: majorToMinor(toNum(rawAmount), effectiveCurrency),
            currency: effectiveCurrency,
          }
        : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    restock: raw.restock,
    refundLineItems: lineItems,
    processedAt: raw.processed_at ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    reason: refund.reason ?? refund.note,
    note: refund.note,
    restock: refund.restock,
    refund_items: refund.refundLineItems?.map((li) => ({
      order_item_id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
