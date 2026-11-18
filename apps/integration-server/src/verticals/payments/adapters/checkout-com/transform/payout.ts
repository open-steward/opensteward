import { requireAmount } from '@opensteward/shared'

import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

export interface RawCheckoutPayout {
  id?: string
  status?: string
  amount?: number
  currency?: string
  scheduled_on?: string
  reference?: string
  [k: string]: unknown
}

function mapStatus(raw: RawCheckoutPayout): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
    case 'completed':
      return 'paid'
    case 'in_transit':
    case 'submitted':
      return 'in_transit'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawCheckoutPayout): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: requireAmount(raw.amount, 'checkout-com payout'),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    arrivalDate: raw.scheduled_on,
    gateway: 'checkout-com',
    metadata: strMap({ reference: raw.reference }),
    raw,
  }
}
