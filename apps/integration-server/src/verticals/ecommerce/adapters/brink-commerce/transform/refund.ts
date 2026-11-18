/**
 * Brink Commerce Refund → canonical Refund.
 *
 * Shapes are the OrderManagement OpenAPI embedded in
 * https://docs.brinkcommerce.com/technical/api-references/order/refunds.md:
 * `GET /orders/{orderId}/refunds` returns `OrderRefunds` `{ refunds: RefundDetails[] }`
 * and `GET /refunds/{refundId}` returns `Refund` (RefundDetails plus provider
 * statuses). RefundDetails requires id, orderId, orderReference,
 * paymentProvider, orderLines, shippingFees, gifts, giftCards,
 * giftCardProducts, totals, created, updated, revision.
 *
 * A refund carries no currency of its own. Each `RefundOrderLine` and
 * `RefundShippingFee` requires a `currencyCode`; the amount is reported only
 * when those name exactly one currency, and omitted otherwise. `totals.grandTotal`
 * is "The grand total for the refund that will be sent to the payment
 * provider", an integer in the order's minor units like every order amount.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'

// ── Raw Brink Commerce shapes (documented fields only) ──────────────────────

/** `RefundOrderLine`: orderLineId, quantity (minimum 1) and currencyCode are required. */
export interface RawBrinkRefundOrderLine {
  orderLineId: string
  quantity: number
  currencyCode: string
  [key: string]: unknown
}

/** `RefundShippingFee`: currencyCode is required. */
export interface RawBrinkRefundShippingFee {
  shippingFeeId: string
  currencyCode: string
  [key: string]: unknown
}

/** `RefundTotals`. */
export interface RawBrinkRefundTotals {
  grandTotal: number
  [key: string]: unknown
}

/** `Reason`: optional `code` ("useful for BI tracking") and `cause` ("human readable cause"). */
export interface RawBrinkReason {
  code?: string
  cause?: string
}

/** `RefundDetails` / `Refund`. */
export interface RawBrinkRefund {
  id: string
  orderId: string
  orderReference?: string
  reason?: RawBrinkReason
  orderLines: RawBrinkRefundOrderLine[]
  shippingFees: RawBrinkRefundShippingFee[]
  totals: RawBrinkRefundTotals
  created?: string
  updated?: string
  completed?: string
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

function soleCurrency(raw: RawBrinkRefund): string | undefined {
  const codes = new Set<string>()
  for (const l of raw.orderLines) codes.add(l.currencyCode)
  for (const f of raw.shippingFees) codes.add(f.currencyCode)
  return codes.size === 1 ? [...codes][0] : undefined
}

export function transformRefund(raw: RawBrinkRefund): Refund {
  const currency = soleCurrency(raw)
  return {
    id: raw.id,
    orderId: raw.orderId,
    amount: currency ? { amount: raw.totals.grandTotal, currency } : undefined,
    reason: raw.reason?.cause,
    refundLineItems: raw.orderLines.map((li) => ({
      lineItemId: li.orderLineId,
      quantity: li.quantity,
    })),
    processedAt: toIsoDatetime(raw.completed),
    createdAt: toIsoDatetime(raw.created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Brink refund request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    reason: refund.reason ? { cause: refund.reason } : undefined,
    orderLines: refund.refundLineItems?.map((li) => ({
      orderLineId: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
