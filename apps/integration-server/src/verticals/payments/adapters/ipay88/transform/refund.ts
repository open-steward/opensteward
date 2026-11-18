import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawIpay88Refund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawIpay88Refund): Refund {
  return {
    id: String(raw['RefNo'] ?? ''),
    externalId: String(raw['RefNo'] ?? ''),
    chargeId: String(raw['RefNo'] ?? ''),
    amount: safeInt(raw['Amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'MYR'),
    status: mapRefundStatus(raw['Status'] as string | undefined),
    gateway: 'ipay88',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['Created'] != null ? String(raw['Created']) : undefined,
    raw,
  }
}
