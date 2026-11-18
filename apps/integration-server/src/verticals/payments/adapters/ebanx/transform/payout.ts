import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * EBANX payout object — returned inside `{ payout: {...} }` by
 * /ws/payout/retrieve, and as elements of `{ payouts: [...] }` by
 * /ws/payout/search.
 *
 * Amounts are decimal-string major units. Status codes:
 *   OP open · PE pending · PA paid · CA cancelled.
 * Dates are `YYYY-MM-DD HH:MM:SS` (no timezone, Brazil local).
 */
export interface RawEbanxPayout {
  uid?: string
  external_reference?: string
  status?: string
  request_date?: string
  status_date?: string
  paid_date?: string | null
  cancel_date?: string | null
  request_amount?: string | number
  request_currency?: string
  debit_amount?: string | number
  debit_fee?: string | number
  debit_amount_total?: string | number
  debit_currency?: string
  target?: string
  payee?: {
    bank_account?: {
      account?: string
      account_last_4?: string
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  order_number?: string
  [k: string]: unknown
}

function mapStatus(raw: RawEbanxPayout): PayoutStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PA':
      return 'paid'
    case 'PE':
    case 'OP':
      return 'pending'
    case 'CA':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawEbanxPayout): Payout {
  const currency = pickCurrency(raw.request_currency ?? raw.debit_currency)
  const last4 = raw.payee?.bank_account?.account_last_4 ?? raw.payee?.bank_account?.account?.slice(-4)
  return {
    id: String(raw.uid ?? raw.external_reference ?? ''),
    externalId: String(raw.uid ?? raw.external_reference ?? ''),
    amount: toMinorUnits(raw.request_amount, currency),
    currency,
    status: mapStatus(raw),
    arrivalDate: toIsoDatetime(raw.paid_date),
    destinationLast4: last4 != null ? String(last4) : undefined,
    gateway: 'ebanx',
    metadata: strMap({
      external_reference: raw.external_reference,
      target: raw.target,
      debit_fee: raw.debit_fee,
      debit_currency: raw.debit_currency,
      order_number: raw.order_number,
    }),
    createdAt: toIsoDatetime(raw.request_date),
    updatedAt: toIsoDatetime(raw.status_date ?? raw.paid_date ?? raw.cancel_date ?? raw.request_date),
    raw,
  }
}
