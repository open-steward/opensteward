import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickStr, requireCurrency, requireMinor, strMap, toIsoDatetime } from './shared'

/**
 * Rapyd Payout object, as List Payouts / Retrieve Payout document it
 * (https://docs.rapyd.net/en/list-payouts.html,
 * https://docs.rapyd.net/en/retrieve-payout.html). Only the documented fields
 * this transform reads are typed.
 *
 *   amount           "Amount of the payout, in units defined by payout_currency.
 *                    Decimal, including the correct number of decimal places for
 *                    the currency exponent ... Same as payout_amount."
 *   payout_currency  "Currency received by the beneficiary. Three-letter ISO 4217 code."
 *   paid_at          "Time of the payout, in Unix time." (a numeric string in the
 *                    documented example)
 *   error            "Indicates the error code of the last unsuccessful operation
 *                    on the payout object."
 */
export interface RawRapydPayout {
  id?: string
  amount?: number | string
  payout_currency?: string
  status?: string
  paid_at?: number | string | null
  error?: string | null
  statement_descriptor?: string | null
  created_at?: number | string
  metadata?: Record<string, unknown> | null
  [k: string]: unknown
}

/**
 * The documented statuses: Canceled, Completed, Confirmation, Created,
 * Declined, Error, Expired, Hold, Pending, Returned.
 */
function mapStatus(status: unknown): PayoutStatus {
  switch (status) {
    case 'Completed':
      // "The beneficiary received some or all payout funds."
      return 'paid'
    case 'Created':
    case 'Confirmation':
    case 'Pending':
    case 'Hold':
      return 'pending'
    case 'Declined':
    case 'Error':
    case 'Returned':
      // Returned: "Funds were returned to after the payout was completed."
      return 'failed'
    case 'Canceled':
    case 'Expired':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

export function transformPayout(raw: RawRapydPayout): Payout {
  const id = pickStr(raw.id)
  if (!id) throw new Error('Rapyd payout has no id')
  const currency = requireCurrency(raw.payout_currency, `payout ${id}`)
  return {
    id,
    externalId: id,
    amount: requireMinor(raw.amount, currency, `payout ${id}`),
    currency,
    status: mapStatus(raw.status),
    arrivalDate: toIsoDatetime(raw.paid_at),
    statementDescriptor: pickStr(raw.statement_descriptor),
    failureCode: pickStr(raw.error),
    gateway: 'rapyd',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
