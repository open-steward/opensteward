/**
 * Swell refund → canonical Refund.
 *
 * Fields read, from the refund model
 * (https://developers.swell.is/backend-api/refunds):
 *   id, amount ("Refund amount denominated in currency."), currency
 *   ("Three-letter ISO currency code in uppercase."), order_id ("ID of the
 *   order the refund was applied to, if applicable."), parent_id ("ID of the
 *   payment the refund was issued for."), reason ("Reason for which the
 *   refund was issued."), reason_message ("A brief message describing the
 *   reason for the refund."), date_created.
 *
 * `orderId` is required canonically: a refund without `order_id` (one issued
 * against a subscription or invoice payment) is refused unless the caller
 * supplies the order it was listed under. The model documents no refunded
 * line items. Money needs both `amount` and `currency`.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'

export interface RawSwellRefund {
  id: string
  order_id?: string | null
  parent_id?: string | null
  amount?: number | null
  currency?: string | null
  reason?: string | null
  reason_message?: string | null
  date_created?: string | null
  [key: string]: unknown
}

export function transformRefund(raw: RawSwellRefund, orderId?: string): Refund {
  const resolvedOrderId = raw.order_id ?? orderId
  if (!resolvedOrderId) {
    throw new Error(`Swell refund ${raw.id} has no order_id`)
  }
  const currency = raw.currency ?? undefined
  return {
    id: raw.id,
    orderId: resolvedOrderId,
    amount:
      raw.amount != null && currency
        ? { amount: majorToMinor(raw.amount, currency), currency }
        : undefined,
    reason: raw.reason ?? undefined,
    note: raw.reason_message ?? undefined,
    transactionIds: raw.parent_id ? [raw.parent_id] : undefined,
    createdAt: raw.date_created ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (refund.amount?.amount != null) body['amount'] = refund.amount.amount
  if (refund.reason !== undefined) body['reason'] = refund.reason
  if (refund.note !== undefined) body['notes'] = refund.note
  if (refund.refundLineItems) {
    body['items'] = refund.refundLineItems.map((li) => ({
      order_item_id: li.lineItemId,
      quantity: li.quantity,
      amount: li.amount?.amount,
    }))
  }
  return body
}
