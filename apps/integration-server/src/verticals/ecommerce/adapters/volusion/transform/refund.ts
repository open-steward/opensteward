/**
 * Volusion Credit Order → canonical Refund.
 *
 * Volusion handles refunds via "credit orders" — a special order record
 * linked to the original order. The credit order has a negative grand
 * total representing the refund amount.
 *
 * Docs: Volusion REST API — /orders/{id}/creditorder
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawVolusionCreditOrderLineItem {
  OrderDetailID?: number | string
  ProductID?: number | string | null
  ProductCode?: string | null
  ProductName?: string | null
  Quantity?: number
  UnitPrice?: number | string | null
  [key: string]: unknown
}

export interface RawVolusionCreditOrder {
  CreditOrderID?: number | string | null
  OrderID?: number | string | null
  OriginalOrderID?: number | string | null
  Currency?: string | null
  GrandTotal?: number | string | null
  RefundAmount?: number | string | null
  RefundReason?: string | null
  RefundNote?: string | null
  RestockItems?: boolean | null
  OrderDetails?: RawVolusionCreditOrderLineItem[]
  DateCreated?: string | null
  LastModified?: string | null
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isNaN(n) ? 0 : Math.abs(majorToMinor(n, currency) ?? 0)
}

export function transformRefund(raw: RawVolusionCreditOrder): Refund {
  const id = raw.CreditOrderID != null ? String(raw.CreditOrderID) : ''
  const orderId =
    raw.OriginalOrderID != null
      ? String(raw.OriginalOrderID)
      : raw.OrderID != null
        ? String(raw.OrderID)
        : ''
  const currency = raw.Currency ?? 'USD'
  const amount = raw.RefundAmount != null
    ? toNum(raw.RefundAmount, currency)
    : raw.GrandTotal != null
      ? toNum(raw.GrandTotal, currency)
      : 0

  const refundLineItems = (raw.OrderDetails ?? []).map((li) => ({
    lineItemId: String(li.OrderDetailID ?? ''),
    quantity: li.Quantity ?? 0,
    amount: li.UnitPrice != null && li.Quantity != null
      ? {
          amount: Math.abs(majorToMinor(
            typeof li.UnitPrice === 'string' ? parseFloat(li.UnitPrice) : (li.UnitPrice ?? 0),
            currency,
          ) ?? 0),
          currency,
        }
      : undefined,
  }))

  return {
    id,
    orderId,
    amount: amount > 0 ? { amount, currency } : undefined,
    reason: raw.RefundReason ?? undefined,
    note: raw.RefundNote ?? undefined,
    restock: raw.RestockItems ?? undefined,
    refundLineItems: refundLineItems.length > 0 ? refundLineItems : undefined,
    processedAt: raw.DateCreated ?? undefined,
    createdAt: raw.DateCreated ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Volusion credit order request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    OrderID: refund.orderId,
    RefundAmount: refund.amount?.amount != null
      ? refund.amount.amount / 100
      : undefined,
    RefundReason: refund.reason,
    RefundNote: refund.note,
    RestockItems: refund.restock,
  }
}
