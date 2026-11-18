/**
 * Wix order refund → canonical Refund.
 *
 * Source: List Transactions For Single Order,
 *   https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-transactions/list-transactions-for-single-order.md
 *   "URL: https://www.wixapis.com/ecom/v1/payments/orders/{orderId}"
 * whose `orderTransactions.refunds` is the "Record of refunds made to the
 * buyer". Amounts are `Price` values with no currency of their own; the
 * caller passes the order's currency, and without it amounts are left out.
 *
 * Ids are `orderId:refundId`, and `transactionIds` are the `orderId:paymentId`
 * ids of the payments each refund transaction draws on, matching the ids
 * `transformTransaction` emits.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundLineItem } from '../../../schema/refund'
import { wixPriceToMoney, type RawWixPrice } from './order'
import { wixPaymentKey } from './transaction'

export interface RawWixRefund {
  id?: string
  transactions?: Array<{
    paymentId?: string
    amount?: RawWixPrice
    refundStatus?: string
    [key: string]: unknown
  }>
  details?: {
    shippingIncluded?: boolean
    /** "Reason for the refund, provided by customer (optional)." */
    reason?: string
    /** "Line items that were refunded." */
    lineItems?: Array<{ lineItemId?: string; quantity?: number }>
  }
  createdDate?: string
  summary?: {
    /** "Total amount requested for refund." */
    requestedRefund?: RawWixPrice
    refunded?: RawWixPrice
    pendingRefund?: RawWixPrice
    failedRefundAmount?: RawWixPrice
    pending?: boolean
  }
  [key: string]: unknown
}

/** Composite id of a refund: `orderId:refundId`. */
export function wixRefundKey(orderId: string, refundId: string): string {
  return `${orderId}:${refundId}`
}

function mapLineItems(raw: RawWixRefund): RefundLineItem[] | undefined {
  const items = raw.details?.lineItems
  if (!items) return undefined
  return items.map((li) => {
    if (!li.lineItemId || typeof li.quantity !== 'number') {
      throw new Error(`Wix refund ${raw.id} has a line item without lineItemId or quantity`)
    }
    return { lineItemId: li.lineItemId, quantity: li.quantity }
  })
}

export function transformRefund(
  raw: RawWixRefund,
  orderId: string,
  currency: string | undefined,
): Refund {
  if (!raw.id) throw new Error(`Wix order ${orderId} has a refund with no id`)
  const paymentIds = (raw.transactions ?? [])
    .map((t) => t.paymentId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return {
    id: wixRefundKey(orderId, raw.id),
    orderId,
    amount: wixPriceToMoney(raw.summary?.requestedRefund, currency),
    reason: raw.details?.reason || undefined,
    refundLineItems: mapLineItems(raw),
    transactionIds: paymentIds.map((p) => wixPaymentKey(orderId, p)),
    createdAt: toIsoDatetime(raw.createdDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Wix refund request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    reason: refund.reason,
    refundItems: refund.refundLineItems?.map((li) => ({
      lineItemId: li.lineItemId,
      quantity: li.quantity,
    })),
    restock: refund.restock,
  }
}
