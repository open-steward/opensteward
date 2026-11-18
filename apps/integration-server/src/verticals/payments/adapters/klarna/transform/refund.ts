import { requireAmount } from '@opensteward/shared'

import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawKlarnaRefund {
  refund_id?: string
  order_id?: string
  refunded_amount?: number
  refunded_at?: string
  currency?: string
  description?: string
  reference?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawKlarnaRefund): Refund {
  return {
    id: String(raw.refund_id ?? ''),
    externalId: String(raw.refund_id ?? ''),
    chargeId: String(raw.order_id ?? ''),
    amount: requireAmount(raw.refunded_amount, 'klarna refund'),
    currency: pickCurrency(raw.currency),
    status: 'succeeded',
    gateway: 'klarna',
    metadata: strMap({ description: raw.description, reference: raw.reference }),
    createdAt: raw.refunded_at,
    raw,
  }
}
