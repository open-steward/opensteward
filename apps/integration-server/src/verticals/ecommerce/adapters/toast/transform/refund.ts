/**
 * The refund on a Toast Orders API `Payment` → canonical Refund.
 *
 * Toast has no refund resource. A refund is the `refund` object of the
 * payment it was taken from (`refundAmount`, `tipRefundAmount`, `refundDate`,
 * `refundBusinessDate`, `refundTransaction`), and GET /orders/v2/payments
 * with `refundBusinessDate` "Returns a list of the payments that were
 * refunded during one business day."
 * https://doc.toasttab.com/openapi/orders/operation/paymentsGet/
 *
 * A payment carries one `refund` object, so the refund's id is the payment's
 * GUID: GET /orders/v2/payments/{guid} reads it back.
 */

import type { Refund } from '../../../schema/refund'
import type { Money } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toastMoney } from './order'
import type { RawToastPayment } from './transaction'

function refundTotal(
  refundAmount: number | null | undefined,
  tipRefundAmount: number | null | undefined,
  currency: string | undefined,
): Money | undefined {
  const base = toastMoney(refundAmount, currency)
  if (!base) return undefined
  const tip = toastMoney(tipRefundAmount, currency)
  return tip ? { amount: base.amount + tip.amount, currency: base.currency } : base
}

export function transformRefund(raw: RawToastPayment, currency: string | undefined): Refund {
  const refund = raw.refund
  if (!refund) throw new Error(`Toast payment ${raw.guid} has no refund`)
  // "The Toast platform identifier for the order that contains the payment."
  // The canonical refund requires its order, and this is its only source.
  if (!raw.orderGuid) throw new Error(`Toast payment ${raw.guid} has no orderGuid`)
  return {
    id: raw.guid,
    orderId: raw.orderGuid,
    // refundAmount: "The amount of the refund, excluding the tip."; plus
    // tipRefundAmount: "The amount of the tip refund."
    amount: refundTotal(refund.refundAmount, refund.tipRefundAmount, currency),
    transactionIds: [raw.guid],
    // refundDate: "The date and time when the refund was made."
    processedAt: toIsoDatetime(refund.refundDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Toast refund request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    paymentGuid: refund.transactionIds?.[0],
    orderGuid: refund.orderId,
    refundAmount: refund.amount?.amount,
    refundReason: refund.reason,
  }
}
