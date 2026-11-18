import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawOpnCharge {
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

export function transformCharge(raw: RawOpnCharge): Charge {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'THB'),
    status: mapStatus(raw['status'] as string | undefined),
    gateway: 'opn-payments',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? raw['custom'] ?? {}),
    createdAt: raw['created'] != null ? String(raw['created']) : undefined,
    raw,
  }
}
