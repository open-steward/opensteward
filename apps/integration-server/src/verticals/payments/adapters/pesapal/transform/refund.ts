import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawPesapalRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawPesapalRefund): Refund {
  return {
    id: String(raw['refund_id'] ?? ''),
    externalId: String(raw['refund_id'] ?? ''),
    chargeId: String(raw['order_tracking_id'] ?? ''),
    amount: toMinorUnits(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'KES'),
    status: mapRefundStatus(raw['status'] as string | undefined),
    gateway: 'pesapal',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created_date'] != null ? String(raw['created_date']) : undefined,
    raw,
  }
}
