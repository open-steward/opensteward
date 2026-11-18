import type { Payout, PayoutStatus } from '../../../schema/payout'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawFlutterwaveTransfer {
  id?: number
  reference?: string
  status?: string
  amount?: number
  currency?: string
  fee?: number
  narration?: string
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawFlutterwaveTransfer): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'successful':
    case 'completed':
      return 'paid'
    case 'pending':
    case 'new':
      return 'pending'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawFlutterwaveTransfer): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    statementDescriptor: raw.narration,
    gateway: 'flutterwave',
    metadata: strMap({ reference: raw.reference, fee: raw.fee }),
    createdAt: raw.created_at,
    raw,
  }
}
