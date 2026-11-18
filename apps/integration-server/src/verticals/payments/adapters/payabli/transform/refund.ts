import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawPayabliRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawPayabliRefund): Refund {
  return {
    id: String(raw['ReferenceData'] ?? ''),
    externalId: String(raw['ReferenceData'] ?? ''),
    chargeId: String(raw['TransactionId'] ?? ''),
    amount: toMinorUnits(raw['NetAmount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'USD'),
    status: mapRefundStatus(raw['TransStatus'] as string | undefined),
    gateway: 'payabli',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['TransactionDate'] != null ? String(raw['TransactionDate']) : undefined,
    raw,
  }
}
