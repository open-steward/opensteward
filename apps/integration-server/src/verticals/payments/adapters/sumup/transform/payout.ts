/**
 * SumUp `FinancialPayout` -> canonical Payout.
 *
 * A row of GET /v1.0/merchants/{merchant_code}/payouts (first-party spec,
 * https://raw.githubusercontent.com/sumup/sumup-openapi/refs/heads/main/openapi.json).
 * Every field below is `required` in `FinancialPayout`. Amounts are "in major
 * units", scaled to minor units by the currency's exponent.
 *
 * Only `type = PAYOUT` rows are payouts; the adapter drops the deduction
 * records ("deduction records for refunds, chargebacks, direct debit returns,
 * or balance adjustments") before this transform.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'

export interface RawSumupPayout {
  /** "Unique identifier of the payout-related record." (int64) */
  id: number
  /** "PAYOUT", "CHARGE_BACK_DEDUCTION", "REFUND_DEDUCTION", "DD_RETURN_DEDUCTION", "BALANCE_DEDUCTION" */
  type: string
  /** "Amount of the payout or deduction in major units." */
  amount: number
  /** "Payout date associated with the record, in `YYYY-MM-DD` format." */
  date: string
  /** "Three-letter ISO 4217 currency code of the payout." */
  currency: string
  /** "Fee amount associated with the payout record, in major units." */
  fee: number
  /** "SUCCESSFUL", "FAILED" */
  status: string
  /** "Processor or payout reference associated with the record." */
  reference: string
  /** "Transaction code of the original sale associated with the payout or deduction." */
  transaction_code: string
}

function payoutStatus(status: string): PayoutStatus {
  if (status === 'SUCCESSFUL') return 'paid'
  if (status === 'FAILED') return 'failed'
  return 'unknown'
}

export function transformPayout(raw: RawSumupPayout): Payout {
  if (typeof raw.id !== 'number') throw new Error('SumUp payout record has no id')
  if (typeof raw.currency !== 'string' || raw.currency === '') {
    throw new Error(`SumUp payout ${raw.id} has no currency`)
  }
  const amount = majorToMinor(typeof raw.amount === 'number' ? raw.amount : undefined, raw.currency)
  if (amount === undefined) throw new Error(`SumUp payout ${raw.id} has no amount`)
  const id = String(raw.id)
  const metadata: Record<string, string> = { type: raw.type, date: raw.date }
  if (typeof raw.reference === 'string') metadata.reference = raw.reference
  if (typeof raw.transaction_code === 'string') metadata.transactionCode = raw.transaction_code
  const fee = majorToMinor(typeof raw.fee === 'number' ? raw.fee : undefined, raw.currency)
  if (fee !== undefined) metadata.feeMinor = String(fee)
  return {
    id,
    externalId: id,
    amount,
    currency: raw.currency,
    status: payoutStatus(raw.status),
    gateway: 'sumup',
    metadata,
    raw,
  }
}
