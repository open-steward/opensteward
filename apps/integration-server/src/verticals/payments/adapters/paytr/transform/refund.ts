import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawPaytrRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawPaytrRefund): Refund {
  return {
    id: String(raw['merchant_oid'] ?? ''),
    externalId: String(raw['merchant_oid'] ?? ''),
    chargeId: String(raw['merchant_oid'] ?? ''),
    amount: safeInt(raw['return_amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'TRY'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'paytr',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created'] != null ? String(raw['created']) : undefined,
    raw,
  }
}
