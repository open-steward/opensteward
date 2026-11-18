import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawSkrillRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawSkrillRefund): Refund {
  return {
    id: String(raw['transaction_id'] ?? ''),
    externalId: String(raw['transaction_id'] ?? ''),
    chargeId: String(raw['mb_transaction_id'] ?? ''),
    amount: toMinorUnits(raw['mb_amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'EUR'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'skrill',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
