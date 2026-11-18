import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

export interface RawGCPayout {
  id?: string
  amount?: number
  currency?: string
  status?: string
  arrival_date?: string
  reference?: string
  payout_type?: string
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawGCPayout): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
      return 'paid'
    case 'pending':
      return 'pending'
    case 'bounced':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawGCPayout): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    arrivalDate: raw.arrival_date,
    gateway: 'gocardless',
    metadata: strMap({ reference: raw.reference, payout_type: raw.payout_type }),
    createdAt: raw.created_at,
    raw,
  }
}
