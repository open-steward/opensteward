import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawTelrRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawTelrRefund): Refund {
  return {
    id: String(raw['ref'] ?? ''),
    externalId: String(raw['ref'] ?? ''),
    chargeId: String(raw['order_ref'] ?? ''),
    amount: toMinorUnits(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'AED'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'telr',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['date'] != null ? String(raw['date']) : undefined,
    raw,
  }
}
