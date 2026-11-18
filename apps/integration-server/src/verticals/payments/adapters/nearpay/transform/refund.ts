import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawNearpayRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawNearpayRefund): Refund {
  return {
    id: String(raw['uuid'] ?? ''),
    externalId: String(raw['uuid'] ?? ''),
    chargeId: String(raw['original_transaction_uuid'] ?? ''),
    amount: safeInt(raw['amount_halalat']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'SAR'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'nearpay',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
