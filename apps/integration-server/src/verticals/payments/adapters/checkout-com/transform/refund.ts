import { requireAmount } from '@opensteward/shared'

import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawCheckoutRefund {
  action_id?: string
  reference?: string
  amount?: number
  currency?: string
  payment_id?: string
  processed_on?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawCheckoutRefund): Refund {
  return {
    id: String(raw.action_id ?? ''),
    externalId: String(raw.action_id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: requireAmount(raw.amount, 'checkout-com refund'),
    currency: pickCurrency(raw.currency),
    status: 'succeeded',
    gateway: 'checkout-com',
    metadata: strMap({ reference: raw.reference }),
    createdAt: raw.processed_on,
    raw,
  }
}
