import { requireAmount } from '@opensteward/shared'

import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

export interface RawSquarePayout {
  id?: string
  status?: string
  amount_money?: { amount?: number; currency?: string }
  destination?: { type?: string; id?: string }
  arrival_date?: string
  type?: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawSquarePayout): PayoutStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PAID':
      return 'paid'
    case 'SENT':
      return 'in_transit'
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawSquarePayout): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: requireAmount(raw.amount_money?.amount, 'square payout'),
    currency: pickCurrency(raw.amount_money?.currency),
    status: mapStatus(raw),
    arrivalDate: raw.arrival_date,
    gateway: 'square',
    metadata: strMap({ destination_type: raw.destination?.type, type: raw.type }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
