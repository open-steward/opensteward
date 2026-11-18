/**
 * Airwallex Transfer (Payout) → canonical Payout.
 *
 * Airwallex "transfers" are fund movements out of the Airwallex wallet to an
 * external bank account. They are retrieved via the Financial Services API:
 *   GET /api/v1/transfers        (list)
 *   GET /api/v1/transfers/{id}   (single)
 *
 * Money is in major units and must be scaled to minor units.
 * Status lifecycle: PENDING → PROCESSING → COMPLETED / FAILED / REVERSED.
 *
 * Refs:
 *   https://www.airwallex.com/docs/api/financial-services/transfers
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { toMinorUnits, pickCurrency, strMap } from './shared'

export interface RawAirwallexTransfer {
  id?: string
  amount?: number
  currency?: string
  status?: string           // PENDING, PROCESSING, COMPLETED, FAILED, REVERSED
  estimated_arrival_date?: string   // ISO date e.g. "2026-02-14"
  method?: string           // SWIFT, LOCAL, …
  fail_reason?: string
  beneficiary?: {
    bank_details?: {
      account_number?: string
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawAirwallexTransfer): PayoutStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'paid'
    case 'PROCESSING':
      return 'in_transit'
    case 'PENDING':
      return 'pending'
    case 'FAILED':
    case 'REVERSED':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawAirwallexTransfer): Payout {
  const amount = toMinorUnits(raw.amount) ?? 0
  const currency = pickCurrency(raw.currency)
  const bankDetails = raw.beneficiary?.bank_details
  const accountNumber = bankDetails?.account_number
  const last4 = typeof accountNumber === 'string' && accountNumber.length >= 4
    ? accountNumber.slice(-4)
    : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount,
    currency,
    status: mapStatus(raw),
    arrivalDate: toIsoDatetime(raw.estimated_arrival_date),
    destinationLast4: last4,
    failureMessage: raw.fail_reason ?? undefined,
    gateway: 'airwallex',
    metadata: strMap({ method: raw.method, status: raw.status }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
