/**
 * SumUp transaction -> canonical Charge.
 *
 * Two documented shapes feed this transform, both from the first-party spec
 * (https://raw.githubusercontent.com/sumup/sumup-openapi/refs/heads/main/openapi.json,
 * linked from https://developer.sumup.com/api):
 *
 *   - `TransactionHistory`, a row of GET /v2.1/merchants/{merchant_code}/transactions/history,
 *     identified by `transaction_id` ("Unique identifier of the transaction.");
 *   - `TransactionFull`, the body of GET /v2.1/merchants/{merchant_code}/transactions,
 *     identified by `id` ("Unique identifier of the transaction.").
 *
 * The retrieve endpoint's `id` query parameter reads the second back from the
 * first: "Retrieves the transaction resource with the specified transaction ID
 * (the `id` parameter in the transaction resource)". The spec's examples give
 * both the same value (`410fc44a-5956-44e1-b5cc-19c6f8d727a4`).
 *
 * Amounts are major units ("amount": 10.1, "Total amount of the transaction."),
 * scaled to minor units by the currency's exponent.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime, pickStr } from './shared'

/** `TransactionStatus`: "SUCCESSFUL", "CANCELLED", "FAILED", "PENDING", "REFUNDED". */
export type SumupTransactionStatus = 'SUCCESSFUL' | 'CANCELLED' | 'FAILED' | 'PENDING' | 'REFUNDED'

/** Fields of `TransactionBase` + `TransactionMixinHistory` + `TransactionHistory` / `TransactionFull`. */
export interface RawSumupTransaction {
  /** TransactionBase / TransactionFull: "Unique identifier of the transaction." */
  id?: string
  /** TransactionHistory: "Unique identifier of the transaction." */
  transaction_id?: string
  /** "Transaction code returned by the acquirer/processing entity after processing the transaction." */
  transaction_code?: string
  /** "Total amount of the transaction." (major units) */
  amount?: number
  /** "Three-letter ISO 4217 currency code of the amount." */
  currency?: string
  /** "The timestamp of when the transaction was created." */
  timestamp?: string
  status?: string
  payment_type?: string
  /** "Short description of the payment." */
  product_summary?: string
  /** TransactionHistory: "Type of the transaction" — PAYMENT, REFUND, CHARGE_BACK. */
  type?: string
  /** TransactionHistory: "Total refunded amount." (major units) */
  refunded_amount?: number
  [key: string]: unknown
}

function chargeStatus(raw: RawSumupTransaction): ChargeStatus {
  switch (raw.status) {
    case 'SUCCESSFUL':
      return 'succeeded'
    case 'CANCELLED':
      return 'cancelled'
    case 'FAILED':
      return 'failed'
    case 'PENDING':
      return 'pending'
    case 'REFUNDED': {
      // "The transaction was refunded in full or in part." Only the history
      // row's `refunded_amount` says which.
      if (typeof raw.refunded_amount !== 'number' || typeof raw.amount !== 'number')
        return 'unknown'
      if (raw.refunded_amount >= raw.amount) return 'refunded'
      if (raw.refunded_amount > 0) return 'partially_refunded'
      return 'unknown'
    }
    default:
      return 'unknown'
  }
}

/**
 * `idField` names the documented identifier of the shape being mapped:
 * `transaction_id` for a history row, `id` for a retrieved transaction.
 */
export function transformCharge(
  raw: RawSumupTransaction,
  idField: 'transaction_id' | 'id' = 'transaction_id',
): Charge {
  const id = raw[idField]
  if (typeof id !== 'string' || id === '') {
    throw new Error(`SumUp transaction has no ${idField}`)
  }
  if (typeof raw.currency !== 'string' || raw.currency === '') {
    throw new Error(`SumUp transaction ${id} has no currency`)
  }
  const amount = majorToMinor(typeof raw.amount === 'number' ? raw.amount : undefined, raw.currency)
  if (amount === undefined) throw new Error(`SumUp transaction ${id} has no amount`)
  const metadata: Record<string, string> = {}
  if (typeof raw.transaction_code === 'string') metadata.transactionCode = raw.transaction_code
  if (typeof raw.payment_type === 'string') metadata.paymentType = raw.payment_type
  return {
    id,
    externalId: id,
    amount,
    currency: raw.currency,
    amountRefunded:
      typeof raw.refunded_amount === 'number'
        ? majorToMinor(raw.refunded_amount, raw.currency)
        : undefined,
    status: chargeStatus(raw),
    description: pickStr(raw.product_summary),
    gateway: 'sumup',
    metadata,
    createdAt: toIsoDatetime(raw.timestamp),
    raw,
  }
}
