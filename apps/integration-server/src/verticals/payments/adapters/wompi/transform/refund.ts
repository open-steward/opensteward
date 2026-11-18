import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawWompiRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawWompiRefund): Refund {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    chargeId: String(raw['transaction_id'] ?? ''),
    amount: safeInt(raw['amount_in_cents']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'COP'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'wompi',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
