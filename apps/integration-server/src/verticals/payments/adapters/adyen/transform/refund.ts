import { requireAmount } from '@opensteward/shared'

import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawAdyenRefundResponse {
  pspReference?: string
  merchantReference?: string
  paymentPspReference?: string
  status?: string
  amount?: { value?: number; currency?: string }
  reason?: string
  [k: string]: unknown
}

function mapStatus(raw: RawAdyenRefundResponse): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'received':
    case 'pending':
      return 'pending'
    case 'success':
    case 'completed':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawAdyenRefundResponse): Refund {
  return {
    id: String(raw.pspReference ?? ''),
    externalId: String(raw.pspReference ?? ''),
    chargeId: raw.paymentPspReference ?? '',
    amount: requireAmount(raw.amount?.value, 'adyen refund'),
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    gateway: 'adyen',
    metadata: strMap({ merchantReference: raw.merchantReference, reason: raw.reason }),
    raw,
  }
}
