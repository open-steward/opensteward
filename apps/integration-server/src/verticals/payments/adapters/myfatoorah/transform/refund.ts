import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawMyfatoorahRefund {
  [k: string]: unknown
}

function mapRefundStatus(s: string | undefined | null): 'succeeded' | 'pending' | 'failed' {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'success' || v === 'successful' || v === 'completed' || v === 'processed' || v === 'succeeded') return 'succeeded'
  if (v === 'failed' || v === 'failure' || v === 'declined' || v === 'error') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawMyfatoorahRefund): Refund {
  return {
    id: String(raw['RefundId'] ?? ''),
    externalId: String(raw['RefundId'] ?? ''),
    chargeId: String(raw['InvoiceId'] ?? ''),
    amount: toMinorUnits(raw['Amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'KWD'),
    status: mapRefundStatus(raw['RefundStatus'] as string | undefined),
    gateway: 'myfatoorah',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['CreatedDate'] != null ? String(raw['CreatedDate']) : undefined,
    raw,
  }
}
