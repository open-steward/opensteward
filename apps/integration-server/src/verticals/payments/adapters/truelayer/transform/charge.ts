/**
 * TrueLayer Payments API v3 payments -> canonical Charge.
 *
 * Two documented shapes:
 *
 * - A `merchant_account_payment` row of GET
 *   /v3/merchant-accounts/{id}/transactions (TransactionMerchantAccountPayment,
 *   "Payment into the merchant account initiated by a TrueLayer Payment"),
 *   which requires `id`, `currency`, `amount_in_minor`, `status` (enum
 *   `settled`), `settled_at`, `payment_source` and `payment_id`. The row `id`
 *   is a transaction id: "the `id` returned for each item is a transaction
 *   `id`, *not* a payment or payout `id`, which is included in a separate
 *   `payment_id` or `payout_id` object." The canonical id is `payment_id`, so
 *   GET /v3/payments/{id} reads the charge back.
 * - The GET /v3/payments/{id} resource (GetPayment), whose PaymentCommon
 *   requires `id`, `amount_in_minor`, `currency`, `beneficiary` and
 *   `payment_method`, with `created_at`, `metadata`, and a `status`
 *   discriminator of authorization_required, authorizing, authorized,
 *   executed, settled, failed or attempt_failed.
 *
 * Docs: https://docs.truelayer.com/reference/merchant-account-get-transactions,
 *       https://docs.truelayer.com/reference/get-payment-1
 */

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime, strMap } from './shared'

export interface RawTrueLayerMerchantAccountPayment {
  type: 'merchant_account_payment'
  id: string
  currency: string
  amount_in_minor: number
  status: string
  settled_at?: string
  payment_id: string
  metadata?: Record<string, string>
  [key: string]: unknown
}

export interface RawTrueLayerPayment {
  id: string
  amount_in_minor: number
  currency: string
  status: string
  created_at?: string
  failure_reason?: string
  metadata?: Record<string, string>
  [key: string]: unknown
}

/**
 * GetPayment `status` -> canonical status. `settled`: "the funds have settled
 * into the beneficiary account. Status only available for payments into
 * merchant accounts", so `executed` is the final success for any other
 * beneficiary. `failed`: "it was authorized successfully, but the money did
 * not move." `attempt_failed` is "A failed payment attempt", not a final
 * state, so it stays pending.
 */
const PAYMENT_STATUS: Record<string, ChargeStatus> = {
  authorization_required: 'pending',
  authorizing: 'pending',
  authorized: 'pending',
  attempt_failed: 'pending',
  executed: 'succeeded',
  settled: 'succeeded',
  failed: 'failed',
}

function paymentStatus(status: unknown): ChargeStatus {
  return (typeof status === 'string' && PAYMENT_STATUS[status]) || 'unknown'
}

export function transformTransactionCharge(raw: RawTrueLayerMerchantAccountPayment): Charge {
  return {
    id: raw.payment_id,
    externalId: raw.payment_id,
    amount: raw.amount_in_minor,
    currency: raw.currency,
    status: paymentStatus(raw.status),
    gateway: 'truelayer',
    metadata: strMap(raw.metadata),
    raw,
  }
}

export function transformPaymentCharge(raw: RawTrueLayerPayment): Charge {
  return {
    id: raw.id,
    externalId: raw.id,
    amount: raw.amount_in_minor,
    currency: raw.currency,
    status: paymentStatus(raw.status),
    ...(typeof raw.failure_reason === 'string' ? { failureCode: raw.failure_reason } : {}),
    gateway: 'truelayer',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
