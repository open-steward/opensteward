import { requireAmount } from '@opensteward/shared'

import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

export interface RawAdyenPayout {
  pspReference?: string
  status?: { statusCode?: string }
  amount?: { value?: number; currency?: string }
  reference?: string
  creationDate?: string
  [k: string]: unknown
}

function mapStatus(raw: RawAdyenPayout): PayoutStatus {
  switch ((raw.status?.statusCode ?? '').toLowerCase()) {
    case 'completed':
    case 'paid':
      return 'paid'
    case 'pending':
    case 'received':
      return 'pending'
    case 'declined':
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawAdyenPayout): Payout {
  return {
    id: String(raw.pspReference ?? ''),
    externalId: String(raw.pspReference ?? ''),
    amount: requireAmount(raw.amount?.value, 'adyen payout'),
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    gateway: 'adyen',
    metadata: strMap({ reference: raw.reference }),
    createdAt: raw.creationDate,
    raw,
  }
}
