import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawPaytrailRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawPaytrailRefund): Refund {
  return {
    id: String(raw['refundId'] ?? ''),
    externalId: String(raw['refundId'] ?? ''),
    chargeId: String(raw['transactionId'] ?? ''),
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'EUR'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'paytrail',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['createdAt'] != null ? String(raw['createdAt']) : undefined,
    raw,
  }
}
