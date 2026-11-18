/**
 * Allegro refunded payment → canonical Refund.
 *
 * Source: GET /payments/refunds (operationId getRefundedPayments, "Get a list
 * of refunded payments"), envelope `{ refunds: RefundDetails[], count,
 * totalCount }`, per https://developer.allegro.pl/swagger.yaml.
 *
 * RefundDetails (required: id, payment, reason, status, createdAt,
 * totalValue):
 *   - `id`          "The payment refund identifier."
 *   - `order.id`    "The order identifier." (the checkout-form id)
 *   - `reason`      enum REFUND, COMPLAINT, PRODUCT_NOT_AVAILABLE, …
 *   - `createdAt`   "Date and time when the refund was created provided in
 *                   ISO 8601 format."
 *   - `totalValue`  Price `{ amount: string, currency: string }`, "Total
 *                   amount for payment refund."
 *   - `sellerComment` "Sellers optional justification for refund."
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawAllegroPrice {
  amount: string
  currency: string
}

export interface RawAllegroRefundDetails {
  id: string
  payment?: { id?: string }
  order?: { id?: string }
  reason?: string
  status?: string
  createdAt?: string
  totalValue?: RawAllegroPrice
  sellerComment?: string
  [key: string]: unknown
}

function toMoney(p: RawAllegroPrice | undefined): Refund['amount'] {
  if (!p) return undefined
  const n = Number.parseFloat(p.amount)
  if (Number.isNaN(n)) return undefined
  return { amount: majorToMinor(n, p.currency), currency: p.currency }
}

export function transformRefundDetails(raw: RawAllegroRefundDetails): Refund {
  // `order` is optional on RefundDetails; a canonical Refund needs its order.
  const orderId = raw.order?.id
  if (!orderId) {
    throw new Error(`Allegro refund '${raw.id}' carries no order.id; cannot map it to a Refund`)
  }
  const amount = toMoney(raw.totalValue)
  return {
    id: raw.id,
    orderId,
    ...(amount ? { amount } : {}),
    reason: raw.reason,
    note: raw.sellerComment,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
