import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawMoyasarPayout {
  [k: string]: unknown
}

function mapStatus(s: string | undefined | null): PayoutStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'paid') return 'paid'
  if (v === 'failed') return 'failed'
  if (v === 'canceled' || v === 'cancelled') return 'cancelled'
  if (v === 'initiated' || v === 'queued') return 'in_transit'
  return 'pending'
}

export function transformPayout(raw: RawMoyasarPayout): Payout {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'SAR'),
    status: mapStatus(raw['status'] as string | undefined),
    gateway: 'moyasar',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    updatedAt: raw['updated_at'] != null ? String(raw['updated_at']) : undefined,
    raw,
  }
}
