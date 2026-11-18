import type { Payout, PayoutStatus } from '../../../schema/payout'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawDLocalPayout {
  id?: string
  status?: string
  amount?: number
  currency?: string
  payout_method?: string
  beneficiary?: { name?: string; document?: string }
  notification_url?: string
  created_date?: string
  [k: string]: unknown
}

function mapStatus(raw: RawDLocalPayout): PayoutStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PAID':
    case 'COMPLETED':
      return 'paid'
    case 'PROCESSING':
      return 'in_transit'
    case 'PENDING':
      return 'pending'
    case 'REJECTED':
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawDLocalPayout): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    statementDescriptor: raw.beneficiary?.name,
    gateway: 'dlocal',
    metadata: strMap({ payout_method: raw.payout_method }),
    createdAt: raw.created_date,
    raw,
  }
}
