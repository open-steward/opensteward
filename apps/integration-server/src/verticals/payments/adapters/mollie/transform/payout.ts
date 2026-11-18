import type { Payout, PayoutStatus } from '../../../schema/payout'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMolliePayout {
  id?: string
  status?: string
  amount?: { value?: string; currency?: string }
  reference?: string
  createdAt?: string
  paidAt?: string
  [k: string]: unknown
}

function mapStatus(raw: RawMolliePayout): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid_out':
    case 'paid':
      return 'paid'
    case 'pending':
    case 'open':
      return 'pending'
    case 'in_transit':
      return 'in_transit'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawMolliePayout): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: decimalToMinor(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    arrivalDate: raw.paidAt,
    gateway: 'mollie',
    metadata: strMap({ reference: raw.reference }),
    createdAt: raw.createdAt,
    raw,
  }
}
