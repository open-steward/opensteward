/**
 * Shopgate ReturnOrder → canonical Refund.
 *
 * Shopgate models refunds as "return orders" on the Order Service.
 * Return orders are identified by `orderNumber` and linked back to a sales
 * order via `salesOrderNumber`.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shopgate shapes ───────────────────────────────────────────────────────

export interface RawShopgateReturnLineItem {
  id?: string | null
  quantity?: number
  productCode?: string | null
  variantCode?: string | null
  unitRefundAmount?: string | number | null
  currency?: string
}

export interface RawShopgateReturnOrder {
  orderNumber: string
  salesOrderNumber?: string | null
  status?: string | null
  notes?: string | null
  currencyCode?: string
  refundAmount?: string | number | null
  lineItems?: RawShopgateReturnLineItem[]
  createdAt?: string
  processedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapLineItems(
  raw: RawShopgateReturnLineItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.id ?? `${li.productCode ?? ''}:${li.variantCode ?? ''}`,
    quantity: li.quantity ?? 1,
    amount:
      li.unitRefundAmount != null
        ? {
            amount: majorToMinor(toNum(li.unitRefundAmount), li.currency ?? currency),
            currency: li.currency ?? currency,
          }
        : undefined,
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawShopgateReturnOrder): Refund {
  const currency = raw.currencyCode ?? 'USD'
  const totalNum = toNum(raw.refundAmount)
  return {
    id: raw.orderNumber,
    orderId: raw.salesOrderNumber ?? raw.orderNumber,
    amount:
      raw.refundAmount != null && totalNum > 0
        ? { amount: majorToMinor(totalNum, currency), currency }
        : undefined,
    note: raw.notes ?? undefined,
    refundLineItems: mapLineItems(raw.lineItems, currency),
    processedAt: raw.processedAt ?? undefined,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Shopgate return order body (create). */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    salesOrderNumber: refund.orderId,
    notes: refund.note,
    lineItems: refund.refundLineItems?.map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
