import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawPinCharge {
  [k: string]: unknown
}

function mapStatus(s: string | undefined | null): ChargeStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'paid' || v === 'completed' || v === 'captured' || v === 'approved' || v === 'true') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'rejected' || v === 'error' || v === 'false') return 'failed'
  if (v === 'refunded' || v === 'reversed') return 'refunded'
  if (v === 'cancelled' || v === 'canceled' || v === 'voided') return 'cancelled'
  return 'pending'
}

export function transformCharge(raw: RawPinCharge): Charge {
  return {
    id: String(raw['token'] ?? ''),
    externalId: String(raw['token'] ?? ''),
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'AUD'),
    status: mapStatus(raw['status_message'] as string | undefined),
    gateway: 'pin-payments',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? raw['custom'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
