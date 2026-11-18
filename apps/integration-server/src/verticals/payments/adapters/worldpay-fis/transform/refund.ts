import { requireAmount } from '@opensteward/shared'

import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawWorldpayRefund {
  refundId?: string
  paymentId?: string
  value?: { amount?: number; currency?: string }
  outcome?: string
  reference?: { transactionReference?: string }
  lastEventDateTime?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawWorldpayRefund): Refund {
  return {
    id: String(raw.refundId ?? ''),
    externalId: String(raw.refundId ?? ''),
    chargeId: String(raw.paymentId ?? ''),
    amount: requireAmount(raw.value?.amount, 'worldpay-fis refund'),
    currency: pickCurrency(raw.value?.currency),
    status: raw.outcome === 'refunded' ? 'succeeded' : 'pending',
    gateway: 'worldpay-fis',
    metadata: strMap({ transactionReference: raw.reference?.transactionReference }),
    createdAt: raw.lastEventDateTime,
    raw,
  }
}
