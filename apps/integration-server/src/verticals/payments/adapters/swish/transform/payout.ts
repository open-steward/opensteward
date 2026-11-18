import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawSwishPayout {
  [k: string]: unknown
}

function mapPayoutStatus(s: string | undefined | null): PayoutStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'paid' || v === 'paid_out' || v === 'completed' || v === 'success' || v === 'successful') return 'paid'
  if (v === 'debited' || v === 'in_transit' || v === 'processing') return 'in_transit'
  if (v === 'failed' || v === 'failure' || v === 'error' || v === 'declined') return 'failed'
  if (v === 'cancelled' || v === 'canceled' || v === 'voided') return 'cancelled'
  return 'pending'
}

export function transformPayout(raw: RawSwishPayout): Payout {
  // Swish uses payoutInstructionUUID as the canonical payout identifier
  const id = String(raw['payoutInstructionUUID'] ?? raw['id'] ?? '')
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'SEK'),
    status: mapPayoutStatus(raw['status'] as string | undefined),
    gateway: 'swish',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['dateCreated'] != null ? String(raw['dateCreated']) : undefined,
    updatedAt: raw['datePaid'] != null ? String(raw['datePaid']) : undefined,
    raw,
  }
}
