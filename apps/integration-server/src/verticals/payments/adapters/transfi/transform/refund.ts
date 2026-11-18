import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawTransfiRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawTransfiRefund): Refund {
  return {
    id: String(raw['refundId'] ?? ''),
    externalId: String(raw['refundId'] ?? ''),
    chargeId: String(raw['orderId'] ?? ''),
    amount: toMinorUnits(raw['fiatAmount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'USD'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'transfi',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['createdAt'] != null ? String(raw['createdAt']) : undefined,
    raw,
  }
}
