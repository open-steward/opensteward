import type { Payout, PayoutStatus } from '../../../schema/payout'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPayPalPayoutItem {
  payout_item_id?: string
  transaction_status?: string
  payout_item?: { amount?: { value?: string; currency_code?: string } }
  time_processed?: string
  [k: string]: unknown
}

function mapStatus(raw: RawPayPalPayoutItem): PayoutStatus {
  switch ((raw.transaction_status ?? '').toUpperCase()) {
    case 'SUCCESS':
      return 'paid'
    case 'PENDING':
      return 'pending'
    case 'UNCLAIMED':
      return 'in_transit'
    case 'FAILED':
    case 'RETURNED':
      return 'failed'
    case 'BLOCKED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawPayPalPayoutItem): Payout {
  return {
    id: String(raw.payout_item_id ?? ''),
    externalId: String(raw.payout_item_id ?? ''),
    amount: decimalToMinor(raw.payout_item?.amount?.value),
    currency: pickCurrency(raw.payout_item?.amount?.currency_code),
    status: mapStatus(raw),
    arrivalDate: raw.time_processed,
    gateway: 'paypal',
    metadata: strMap({}),
    raw,
  }
}
