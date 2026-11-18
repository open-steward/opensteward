import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawStarkBankRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawStarkBankRefund): Refund {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    chargeId: String(raw['paymentId'] ?? ''),
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'BRL'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'stark-bank',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created'] != null ? String(raw['created']) : undefined,
    raw,
  }
}
