import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawPaystackRefund {
  id?: number
  transaction?: number | { id?: number; reference?: string }
  amount?: number
  currency?: string
  status?: string
  refunded_at?: string
  created_at?: string
  customer_note?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawPaystackRefund): Refund {
  const tx = typeof raw.transaction === 'object' ? raw.transaction : { id: raw.transaction }
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(tx?.reference ?? tx?.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: (raw.status ?? '').toLowerCase() === 'processed' ? 'succeeded' : 'pending',
    gateway: 'paystack',
    metadata: strMap({ customer_note: raw.customer_note }),
    createdAt: raw.created_at,
    updatedAt: raw.refunded_at,
    raw,
  }
}
