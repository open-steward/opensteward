import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawModernTreasuryReversal {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawModernTreasuryReversal): Refund {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    chargeId: String(raw['payment_order_id'] ?? ''),
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'USD'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'modern-treasury',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
