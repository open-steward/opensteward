/**
 * Instamojo refund case → canonical Refund.
 *
 * Instamojo's v2 "Get details of a refund" endpoint,
 * GET /v2/resolutioncenter/cases/{id}/
 * (https://docs.instamojo.com/reference/get-details-of-a-refund-1), returns the
 * refund case as the top-level body, not wrapped in a `refund` key. Its path
 * parameter is documented as "ID of the refund", and the case id has the same
 * shape ("C5c0751272") as the `refund.id` that "Create a Refund" returns
 * ("C5c0751269"), so the ids createRefund hands out can be read back here.
 *
 * Documented case fields read here (example response on that page):
 *
 *   id          "C5c0751272"
 *   payment     "https://api.instamojo.com/v2/payments/MOJO5a06005J21512197/"
 *               ("v2 link to payment against which the refund is made")
 *   type        "QFL"  (the three-letter reason code from "Create a Refund")
 *   body        "Customer isn't satisfied with the quality"
 *   created_at  "2020-10-22T11:57:21.410686Z"
 *
 * In this adapter canonical Orders are Payment Requests and Transactions are
 * Payments. The case names only its payment, so:
 *
 *   transactionIds ← [payment id parsed from the case's `payment` link]
 *   orderId        ← payment request id parsed from that payment's
 *                    `payment_request` link. "Get Payment Details",
 *                    GET /v2/payments/{id}/
 *                    (https://docs.instamojo.com/reference/get-payment-details-1),
 *                    documents it as "null" or "Link: v2 API link of payment
 *                    request object", and "Response will be 'null' if payment
 *                    is not made against a payment request."
 *
 * A payment made without a payment request has no order in this adapter's id
 * space, and orderId is required, so the transform throws rather than filling
 * orderId with the payment id.
 *
 * `amount` is omitted: the case carries `refund_amount` ("2500.00") but no
 * currency field, and the vertical never defaults a currency.
 */

import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawInstamojoRefundCase {
  id: string
  payment: string
  type?: string | null
  body?: string | null
  created_at?: string | null
  [key: string]: unknown
}

/** The one field of "Get Payment Details" (top-level body) read here. */
export interface RawInstamojoPaymentDetail {
  payment_request: string | null
  [key: string]: unknown
}

const PAYMENT_LINK = /\/v2\/payments\/([^/?#]+)\/?$/
const PAYMENT_REQUEST_LINK = /\/v2\/payment_requests\/([^/?#]+)\/?$/

/** The payment id in a refund case's documented `payment` link; throws if absent. */
export function refundCasePaymentId(raw: RawInstamojoRefundCase): string {
  const match = PAYMENT_LINK.exec(typeof raw.payment === 'string' ? raw.payment : '')
  if (!match?.[1]) {
    throw new Error(
      `Instamojo refund case ${String(raw.id)} has no v2 payment link in 'payment': ${String(raw.payment)}`,
    )
  }
  return match[1]
}

export function transformRefundCase(
  raw: RawInstamojoRefundCase,
  payment: RawInstamojoPaymentDetail,
): Refund {
  const paymentId = refundCasePaymentId(raw)
  const link = payment.payment_request
  const match = PAYMENT_REQUEST_LINK.exec(typeof link === 'string' ? link : '')
  if (!match?.[1]) {
    throw new Error(
      `Instamojo refund case ${raw.id}: payment ${paymentId} was not made against a payment request (payment_request: ${String(link)}), so the refund has no order id`,
    )
  }
  return {
    id: raw.id,
    orderId: match[1],
    transactionIds: [paymentId],
    reason: raw.type ?? undefined,
    note: raw.body ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
