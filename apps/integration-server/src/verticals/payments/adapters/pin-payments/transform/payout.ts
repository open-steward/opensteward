import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, safeInt } from './shared'

/**
 * Pin Payments Transfer (payout to a bank account).
 * GET /recipients/{token}/transfers → list of transfer objects.
 */
export interface RawPinTransfer {
  [k: string]: unknown
}

function mapStatus(s: string | undefined | null): PayoutStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'paid' || v === 'success' || v === 'succeeded' || v === 'completed') return 'paid'
  if (v === 'failed' || v === 'failure' || v === 'rejected') return 'failed'
  if (v === 'cancelled' || v === 'canceled') return 'cancelled'
  if (v === 'in_transit' || v === 'processing') return 'in_transit'
  return 'pending'
}

export function transformPayout(raw: RawPinTransfer): Payout {
  return {
    id: String(raw['token'] ?? ''),
    externalId: String(raw['token'] ?? ''),
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'AUD'),
    status: mapStatus(raw['status'] as string | undefined),
    gateway: 'pin-payments',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
