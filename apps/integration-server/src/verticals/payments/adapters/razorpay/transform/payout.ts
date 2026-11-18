import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawRazorpayPayout {
  id?: string
  amount?: number
  currency?: string
  status?: string
  mode?: string
  purpose?: string
  reference_id?: string
  fees?: number
  tax?: number
  scheduled_at?: number
  created_at?: number
  [k: string]: unknown
}

function mapStatus(raw: RawRazorpayPayout): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'processed':
      return 'paid'
    case 'queued':
    case 'pending':
    case 'scheduled':
    case 'initiated':
      return 'pending'
    case 'processing':
      return 'in_transit'
    case 'reversed':
    case 'failed':
    case 'rejected':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawRazorpayPayout): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    method: raw.mode === 'IMPS' ? 'instant' : 'standard',
    arrivalDate: toIso(raw.scheduled_at),
    gateway: 'razorpay',
    metadata: strMap({ purpose: raw.purpose, reference_id: raw.reference_id }),
    createdAt: toIso(raw.created_at),
    raw,
  }
}
