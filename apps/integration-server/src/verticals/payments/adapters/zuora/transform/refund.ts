/**
 * Zuora Refund -> canonical Refund.
 *
 * Fields are those of `GET /object-query/refunds` ("List refunds",
 * https://developer.zuora.com/v1-api-reference/api/object-queries/queryrefunds.md),
 * with the refund applications expanded (`expand[]` enum value
 * "refundapplications"):
 *   data.id         "The unique identifier of the refund."
 *   data.amount     "The total amount of the refund."
 *   data.currency   "The currency of the refund."
 *   data.status     Enum: "Processed", "Canceled", "Error", "Processing"
 *   data.gatewayResponse "The message returned from the payment gateway for the refund."
 *   data.createdDate / data.updatedDate
 *   data.refundApplications.paymentId
 *                   "The unique identifier of the payment associated with the refund application."
 * A refund row names no payment itself; the payment it refunds (the canonical
 * `chargeId`, which is a Zuora payment id — see charge.ts) comes only from its
 * refund applications. A refund with none has no charge, and is an error
 * rather than a row with an invented one.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime, pickStr } from './shared'

export interface RawZuoraRefund {
  id: string
  amount?: number | null
  currency?: string | null
  status?: string | null
  /** "Specifies whether the refund is a refund payment or a credit balance." Enum: "Payment", "CreditBalance", "CreditMemo" */
  sourceType?: string | null
  gatewayResponse?: string | null
  createdDate?: string | null
  updatedDate?: string | null
  refundApplications?: Array<{ paymentId?: string | null }> | null
  [key: string]: unknown
}

const STATUS: Record<string, RefundStatus> = {
  Processed: 'succeeded',
  Processing: 'pending',
  Error: 'failed',
  Canceled: 'cancelled',
}

export function transformRefund(raw: RawZuoraRefund): Refund {
  if (typeof raw.amount !== 'number' || typeof raw.currency !== 'string' || !raw.currency) {
    throw new Error(`Zuora refund ${raw.id} has no amount or currency`)
  }
  const chargeId = (raw.refundApplications ?? []).map((a) => pickStr(a.paymentId)).find(Boolean)
  if (!chargeId)
    throw new Error(`Zuora refund ${raw.id} has no refund application naming a payment`)
  const currency = raw.currency.toUpperCase()
  return {
    id: raw.id,
    externalId: raw.id,
    chargeId,
    amount: majorToMinor(raw.amount, currency),
    currency,
    status: (raw.status && STATUS[raw.status]) || 'unknown',
    failureReason: raw.status === 'Error' ? pickStr(raw.gatewayResponse) : undefined,
    gateway: 'zuora',
    metadata: {},
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    raw,
  }
}
