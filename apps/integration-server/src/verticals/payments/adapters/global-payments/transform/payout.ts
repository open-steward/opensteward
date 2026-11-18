/**
 * GP-API settlement deposit -> canonical Payout.
 *
 * Fields are those of the `deposits[]` items of GET /settlement/deposits and
 * of the GET /settlement/deposits/{id} response
 * (https://developer.globalpayments.com/api/settlement-reporting):
 *
 * - amount: "The amount that should be credited or debited to a bank
 *   account, for a deposit. It is always represented in the lowest
 *   denomination of the related currency." (a string, e.g. "500")
 * - currency: "The currency of the amount in ISO-4217(alpha-3)"
 * - status: "*`FUNDED` - Deposit Funded to bank account *`IRREG` - Deposit
 *   not funded by Global Payments *`RESERVED `- Deposit on reserve.
 *   *`DELAYED` - Deposit delayed for funding. *`RELEASED` - Deposit released
 *   by Global Payments from a status of DELAYED"
 * - funding_type: "Indicates if the amount relates to a Debit or Credit to
 *   the merchant's bank account." (example "DEBIT")
 * - time_created: "The settlement system date that the deposit was initiated
 *   in ISO-8601 format" (example "2021-05-03": a date with no time or zone,
 *   so it is kept in metadata rather than invented into a UTC instant)
 * - bank_transfer.masked_account_number_last4
 */

import type { Payout, PayoutStatus } from '../../../schema/payout'
import { currencyOf, minorUnits } from './charge'

export interface RawGlobalPaymentsDeposit {
  id: string
  time_created?: string
  status?: string
  funding_type?: string
  amount?: string
  currency?: string
  aggregation_model?: string
  bank_transfer?: { masked_account_number_last4?: string; bank?: { code?: string } }
  [key: string]: unknown
}

/**
 * FUNDED is paid; RESERVED ("on reserve") and DELAYED ("delayed for funding")
 * are not yet paid. IRREG ("not funded by Global Payments") and RELEASED
 * ("released ... from a status of DELAYED") name no canonical state, so they
 * map to 'unknown' and stay readable in `raw`.
 */
const STATUS: Record<string, PayoutStatus> = {
  FUNDED: 'paid',
  RESERVED: 'pending',
  DELAYED: 'pending',
}

export function transformPayout(raw: RawGlobalPaymentsDeposit): Payout {
  const what = `deposit ${raw.id}`
  const status = typeof raw.status === 'string' ? raw.status.trim() : ''
  const metadata: Record<string, string> = {}
  if (typeof raw.time_created === 'string' && raw.time_created !== '') {
    metadata.settlement_date = raw.time_created
  }
  if (typeof raw.funding_type === 'string' && raw.funding_type !== '') {
    metadata.funding_type = raw.funding_type
  }
  if (typeof raw.aggregation_model === 'string' && raw.aggregation_model !== '') {
    metadata.aggregation_model = raw.aggregation_model
  }
  const last4 = raw.bank_transfer?.masked_account_number_last4
  return {
    id: raw.id,
    externalId: raw.id,
    amount: minorUnits(raw.amount, what),
    currency: currencyOf(raw.currency, what),
    status: STATUS[status] ?? 'unknown',
    ...(typeof last4 === 'string' && last4 !== '' ? { destinationLast4: last4 } : {}),
    gateway: 'global-payments',
    metadata,
    raw,
  }
}
