/**
 * Maps a Nexi Checkout (Nets Easy) **payout** onto the canonical `Payout`.
 *
 * The Reporting API v1 exposes two payout endpoints:
 *   GET /report/v1/payouts          — paginated list of payouts
 *   GET /report/v1/payouts/{id}     — single payout detail
 *
 * The payout object contains: id, reference, date, bankAccountIban,
 * bankAccountBic, currency, amount (int64 minor units), chargedAmount,
 * refundedAmount, fees, feeTaxAmount, etc.
 *
 * Note: The Reporting API lives at the same base host (api.dibspayment.eu)
 * but under the path prefix /report/v1/ rather than /v1/. The adapter
 * client is configured with baseURL set to api.dibspayment.eu/v1, so payout
 * calls use the client with the adjusted path prefix (../../report/v1/...).
 * In practice the NexiClient uses baseURL = `${API_BASE_URL}/v1`, so paths
 * like /report/v1/payouts resolve correctly as absolute path substitutions.
 *
 * Docs: https://developer.nexigroup.com/nexi-checkout/en-EU/api/reporting-v1/
 */
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, toIsoDatetime } from './shared'

export interface RawNexiPayout {
  id?: string
  reference?: string
  /** ISO-8601 date string of the payout settlement date. */
  date?: string
  bankAccountIban?: string
  bankAccountBic?: string
  currency?: string
  /** Net payout amount in minor units. */
  amount?: number
  chargedAmount?: number
  numberOfCharges?: number
  refundedAmount?: number
  numberOfRefunds?: number
  depositedAmount?: number
  numberOfDeposits?: number
  fees?: number
  feeTaxRate?: number
  feeTaxAmount?: number
  [k: string]: unknown
}

export interface RawNexiPayoutListResponse {
  numberOfPayouts?: number
  payouts?: RawNexiPayout[]
}

function mapStatus(_raw: RawNexiPayout): PayoutStatus {
  // The Reporting API only returns completed payouts (settled with the bank).
  return 'paid'
}

export function transformPayout(raw: RawNexiPayout): Payout {
  const id = raw.id ?? ''

  const meta: Record<string, unknown> = {
    reference: raw.reference,
    bankAccountIban: raw.bankAccountIban,
    bankAccountBic: raw.bankAccountBic,
    chargedAmount: raw.chargedAmount,
    refundedAmount: raw.refundedAmount,
    fees: raw.fees,
  }

  return {
    id: String(id),
    externalId: String(id),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    method: 'standard',
    arrivalDate: toIsoDatetime(raw.date),
    destinationLast4: undefined,
    statementDescriptor: raw.reference,
    failureCode: undefined,
    failureMessage: undefined,
    gateway: 'nexi',
    metadata: strMap(meta),
    createdAt: toIsoDatetime(raw.date),
    updatedAt: toIsoDatetime(raw.date),
    raw,
  }
}
