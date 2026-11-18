/**
 * Centra Order API Return → canonical Refund.
 *
 * Centra uses "returns" (GET /returns / POST /return) rather than "refunds".
 * Response fields:
 *  - `returnId`         — stable id
 *  - `orderId`          — parent order id
 *  - `shipmentId`       — parent shipment id
 *  - `date`             — ISO-8601 creation date
 *  - `completed`        — boolean
 *  - `returnCost`       — major-unit cost charged to customer
 *  - `shippingCost`     — major-unit shipping cost
 *  - `currency`
 *  - `comment`          — free-text note
 *  - `returnToStock`    — boolean (restock flag)
 *  - `products[]`       — [{returnLineId, shipmentLineId, orderLineId,
 *                           quantity, price, …}]
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCentraReturnLineItem {
  returnLineId?: number | string
  shipmentLineId?: number | string
  orderLineId?: number | string
  quantity: number
  price?: string | number
  [key: string]: unknown
}

export interface RawCentraReturn {
  returnId: number | string
  orderId?: number | string
  shipmentId?: number | string
  date?: string | null
  completed?: boolean
  returnCost?: string | number
  shippingCost?: string | number
  currency?: string
  comment?: string | null
  returnToStock?: boolean
  products?: RawCentraReturnLineItem[]
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapRefundLineItems(
  raw: RawCentraReturnLineItem[] | undefined,
  currency: string,
): RefundLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: String(li.orderLineId ?? li.shipmentLineId ?? li.returnLineId ?? ''),
    quantity: li.quantity,
    amount:
      li.price != null
        ? { amount: majorToMinor(toNum(li.price), currency), currency }
        : undefined,
  }))
}

export function transformRefund(raw: RawCentraReturn): Refund {
  const currency = raw.currency ?? 'USD'
  const totalCost = toNum(raw.returnCost)
  return {
    id: String(raw.returnId),
    orderId: raw.orderId != null ? String(raw.orderId) : '',
    amount:
      totalCost > 0
        ? { amount: majorToMinor(totalCost, currency), currency }
        : undefined,
    note: raw.comment ?? undefined,
    restock: raw.returnToStock,
    refundLineItems: mapRefundLineItems(raw.products, currency),
    processedAt: toIsoDatetime(raw.date),
    createdAt: toIsoDatetime(raw.date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    comment: refund.note,
    returnToStock: refund.restock,
    products: refund.refundLineItems?.map((li) => ({
      orderLineId: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
