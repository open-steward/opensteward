import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { strMap, toMinorUnits } from './shared'

/**
 * A Tap payout, as the `payouts` array of POST /v2/payouts/list documents it
 * (https://developers.tap.company/reference/list-payouts.md, and the same
 * shape for a single payout at
 * https://developers.tap.company/reference/retrieve-a-payout.md):
 *
 *   "id": "payout_xxxx", "status": "PAID_OUT", "date": 1722781680000,
 *   "amount": 300, "currency": "AED", "merchant_id": "599242",
 *   "wallet": { "id", "legacy_id", "country", "bank": { "id", "country",
 *   "name", "swift", "beneficiary": { "name", "iban" } } },
 *   "settlements_available": true, "bank_reference": ""
 *
 * `amount` is a decimal in major units: the Payout Webhook and Download API
 * page's example carries `"amount": 7351.874, "currency": "KWD"`
 * (https://developers.tap.company/reference/webhook-api.md).
 */
export interface RawTapPayout {
  id?: string
  status?: string
  /** Unix epoch milliseconds, e.g. 1722781680000. */
  date?: number
  amount?: number
  currency?: string
  merchant_id?: string
  wallet?: {
    id?: string
    legacy_id?: string
    country?: string
    bank?: {
      id?: string
      country?: string
      name?: string
      swift?: string
      beneficiary?: { name?: string; iban?: string }
    }
  }
  settlements_available?: boolean
  bank_reference?: string
  [k: string]: unknown
}

/**
 * Tap documents four payout statuses: "***payoutStatus*** : Shows status of
 * the payout (PENDING, INITIATED, FAILED, PAID\_OUT)."
 * (https://developers.tap.company/reference/webhook-api.md, whose example is
 * the same payout object /payouts/list returns). Tap does not define
 * INITIATED; it is read as a transfer that has started and is not yet paid
 * out, so it maps to `in_transit`. Any other value maps to `unknown`.
 */
const STATUS: Record<string, PayoutStatus> = {
  PENDING: 'pending',
  INITIATED: 'in_transit',
  FAILED: 'failed',
  PAID_OUT: 'paid',
}

function mapStatus(status: string | undefined): PayoutStatus {
  return status !== undefined && Object.hasOwn(STATUS, status) ? STATUS[status] : 'unknown'
}

function missing(field: string, id: string | undefined): Error {
  return new Error(`Tap Payments payout ${id ?? '(no id)'} has no documented ${field}`)
}

export function transformPayout(raw: RawTapPayout): Payout {
  if (typeof raw.id !== 'string' || raw.id === '') throw missing('id', undefined)
  if (typeof raw.currency !== 'string' || raw.currency === '') throw missing('currency', raw.id)
  if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount)) {
    throw missing('amount', raw.id)
  }
  const currency = raw.currency
  const date = typeof raw.date === 'number' ? toIsoDatetime(raw.date) : undefined
  const bank = raw.wallet?.bank
  const iban = bank?.beneficiary?.iban
  return {
    id: raw.id,
    externalId: raw.id,
    amount: toMinorUnits(raw.amount, currency),
    currency,
    status: mapStatus(raw.status),
    arrivalDate: date,
    destinationLast4: iban && iban.length >= 4 ? iban.slice(-4) : undefined,
    gateway: 'tap-payments',
    metadata: strMap({
      merchant_id: raw.merchant_id,
      wallet_id: raw.wallet?.id,
      bank_name: bank?.name,
      bank_swift: bank?.swift,
      beneficiary_name: bank?.beneficiary?.name,
      bank_reference: raw.bank_reference || undefined,
      settlements_available: raw.settlements_available,
    }),
    createdAt: date,
    raw,
  }
}
