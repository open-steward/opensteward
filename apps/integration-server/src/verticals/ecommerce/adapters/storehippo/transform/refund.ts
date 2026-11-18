/**
 * StoreHippo `ms.refunds` record → canonical Refund.
 *
 * "Refunds allow you to return the money to the customer of the items."
 * Fields, from the ms-refunds reference
 * (https://help.storehippo.com/api/reference/ms-refunds):
 *   order_id         "This field stores the id of the order." (ex OID-243; required)
 *   note             "A text field which takes a reason for doing the refund."
 *   transaction_info { amount, payment_gateway, status,
 *                      currency "It stores the currency used in the transaction.",
 *                      txn_id "It stores the id of the transaction." }
 *   amount_refunded  "It stores the amount for the refund."
 *   created_on       "It stores the date and time at which the refund process was created."
 * `_id` is on every record in the documented responses.
 *
 * The amount is reported only when the record names its currency
 * (`transaction_info.currency`).
 *
 * `order_id` is the order's display number (its example "OID-243" has the
 * shape of the ms.orders `order_id`, "OID100": "Prefix ... Sequence
 * number"), not the order `_id` that is Order.id. The adapter resolves it
 * through ms.orders and passes the resolved Order.id in.
 */

import type { Refund } from '../../../schema/refund'
import { minorToMajor } from '../../../schema/shared'
import { currencyCode, money, recordId, text } from '../values'

export interface RawStoreHippoRefund {
  _id?: string
  order_id?: string
  refund_type?: string
  note?: string
  restock?: string
  transaction_info?: {
    amount?: string
    payment_gateway?: string
    status?: string
    currency?: string
    txn_id?: string
  }
  amount_refunded?: string | number
  created_on?: string
  [key: string]: unknown
}

/** The refund's documented `order_id`: the order's display number. Required. */
export function refundOrderNumber(raw: RawStoreHippoRefund): string {
  const orderNumber = text(raw.order_id)
  if (!orderNumber) throw new Error(`StoreHippo refund ${recordId(raw, 'refund')} has no order_id`)
  return orderNumber
}

/** `orderId` is the Order.id (ms.orders `_id`) the refund's `order_id` resolved to. */
export function transformRefund(raw: RawStoreHippoRefund, orderId: string): Refund {
  const id = recordId(raw, 'refund')
  const amount = money(raw.amount_refunded, currencyCode(raw.transaction_info?.currency))
  const txnId = text(raw.transaction_info?.txn_id)
  return {
    id,
    orderId,
    ...(amount ? { amount } : {}),
    ...(text(raw.note) ? { note: raw.note } : {}),
    ...(txnId ? { transactionIds: [txnId] } : {}),
    ...(text(raw.created_on) ? { createdAt: raw.created_on } : {}),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Refund → StoreHippo refund body for create. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    orderId: refund.orderId,
    amount: minorToMajor(refund.amount?.amount, refund.amount?.currency),
    currency: refund.amount?.currency,
    reason: refund.reason,
    note: refund.note,
    restock: refund.restock,
  }
}
