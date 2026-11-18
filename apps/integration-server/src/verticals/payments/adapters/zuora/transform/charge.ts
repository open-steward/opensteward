/**
 * Zuora Payment -> canonical Charge.
 *
 * Zuora has no charge object; the money a customer paid is a Payment. Fields
 * are those of `GET /object-query/payments` ("List payments",
 * https://developer.zuora.com/v1-api-reference/api/object-queries/querypayments.md):
 *   data.id              "The unique identifier of the payment."
 *   data.accountId       "The ID of the customer account that the payment is for."
 *   data.amount          "The total amount of the payment."
 *   data.currency        (example "USD")
 *   data.refundAmount    "The amount of the payment that is refunded."
 *   data.status          Enum: "Draft", "Processing", "Processed", "Error", "Canceled", "Posted"
 *   data.paymentMethodId "The unique ID of the payment method that the customer used to make the payment."
 *   data.comment         "Comments about the payment."
 *   data.gatewayResponse / data.gatewayResponseCode
 *                        "The message [code] returned from the payment gateway for the payment."
 *   data.createdDate / data.updatedDate
 * Amounts are major-unit decimals (`amount: 14.99`, `currency: USD` in the
 * documented example).
 */

import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime, pickStr } from './shared'

export interface RawZuoraPayment {
  id: string
  accountId?: string | null
  amount?: number | null
  currency?: string | null
  refundAmount?: number | null
  status?: string | null
  paymentMethodId?: string | null
  comment?: string | null
  gatewayResponse?: string | null
  gatewayResponseCode?: string | null
  createdDate?: string | null
  updatedDate?: string | null
  [key: string]: unknown
}

const STATUS: Record<string, ChargeStatus> = {
  Draft: 'pending',
  Processing: 'pending',
  Processed: 'succeeded',
  Error: 'failed',
  Canceled: 'cancelled',
}

export function transformCharge(raw: RawZuoraPayment): Charge {
  if (typeof raw.amount !== 'number' || typeof raw.currency !== 'string' || !raw.currency) {
    throw new Error(`Zuora payment ${raw.id} has no amount or currency`)
  }
  const currency = raw.currency.toUpperCase()
  const failed = raw.status === 'Error'
  return {
    id: raw.id,
    externalId: raw.id,
    amount: majorToMinor(raw.amount, currency),
    currency,
    amountRefunded:
      typeof raw.refundAmount === 'number' ? majorToMinor(raw.refundAmount, currency) : undefined,
    status: (raw.status && STATUS[raw.status]) || 'unknown',
    customerId: pickStr(raw.accountId),
    paymentMethodId: pickStr(raw.paymentMethodId),
    description: pickStr(raw.comment),
    failureCode: failed ? pickStr(raw.gatewayResponseCode) : undefined,
    failureMessage: failed ? pickStr(raw.gatewayResponse) : undefined,
    gateway: 'zuora',
    metadata: {},
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    raw,
  }
}
