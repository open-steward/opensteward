/**
 * TrueLayer Payments API v3 payouts -> canonical Payout.
 *
 * Two documented shapes:
 *
 * - A `payout` row of GET /v3/merchant-accounts/{id}/transactions
 *   (TransactionPayoutExecuted, "Payment out of the merchant account"), which
 *   requires `id`, `currency`, `amount_in_minor`, `status`, `created_at`,
 *   `executed_at`, `beneficiary`, `context_code` and `payout_id`. "a
 *   `payout_id` is the same as the associated transaction `id`." The schema's
 *   status enum is `executed`; the guide's example response also shows a
 *   `pending` payout row.
 * - The GET /v3/payouts/{id} resource (Payout), whose PayoutCommon requires
 *   `id`, `merchant_account_id`, `amount_in_minor` ("A 'cent' value
 *   representing the amount, e.g. 100 == 1GBP"), `currency`, `beneficiary`
 *   and `created_at`, with a `status` discriminator of pending,
 *   authorization_required, authorizing, authorized, executed or failed, and
 *   `failure_reason` on failed payouts.
 *
 * Docs: https://docs.truelayer.com/reference/merchant-account-get-transactions,
 *       https://docs.truelayer.com/docs/get-your-merchant-account-transactions-or-payment-sources,
 *       https://docs.truelayer.com/reference/get-payout
 */

import type { Payout, PayoutStatus } from '../../../schema/payout'
import { toIsoDatetime, strMap } from './shared'

export interface RawTrueLayerPayoutTransaction {
  type: 'payout'
  id: string
  currency: string
  amount_in_minor: number
  status: string
  created_at: string
  executed_at?: string
  payout_id: string
  metadata?: Record<string, string>
  [key: string]: unknown
}

export interface RawTrueLayerPayout {
  id: string
  merchant_account_id: string
  amount_in_minor: number
  currency: string
  status: string
  created_at: string
  executed_at?: string
  failure_reason?: string
  metadata?: Record<string, string>
  [key: string]: unknown
}

/**
 * Payout `status` -> canonical status. `pending`: "created against
 * TrueLayer's API but it has not yet been authorized and sent to the payment
 * scheme"; `executed`: "the funds have left your merchant account"; `failed`:
 * "the funds have not left your merchant account."
 */
const PAYOUT_STATUS: Record<string, PayoutStatus> = {
  pending: 'pending',
  authorization_required: 'pending',
  authorizing: 'pending',
  authorized: 'pending',
  executed: 'paid',
  failed: 'failed',
}

function payoutStatus(status: unknown): PayoutStatus {
  return (typeof status === 'string' && PAYOUT_STATUS[status]) || 'unknown'
}

export function transformTransactionPayout(raw: RawTrueLayerPayoutTransaction): Payout {
  return {
    id: raw.payout_id,
    externalId: raw.payout_id,
    amount: raw.amount_in_minor,
    currency: raw.currency,
    status: payoutStatus(raw.status),
    gateway: 'truelayer',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}

export function transformPayout(raw: RawTrueLayerPayout): Payout {
  return {
    id: raw.id,
    externalId: raw.id,
    amount: raw.amount_in_minor,
    currency: raw.currency,
    status: payoutStatus(raw.status),
    ...(typeof raw.failure_reason === 'string' ? { failureCode: raw.failure_reason } : {}),
    gateway: 'truelayer',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
