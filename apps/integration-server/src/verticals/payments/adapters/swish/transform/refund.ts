import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawSwishRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawSwishRefund): Refund {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    chargeId: String(raw['originalPaymentReference'] ?? ''),
    amount: toMinorUnits(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'SEK'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'swish',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['dateCreated'] != null ? String(raw['dateCreated']) : undefined,
    raw,
  }
}
