import type { Refund } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawFlutterwaveRefund {
  id?: number
  tx_id?: number
  amount_refunded?: number
  amount?: number
  status?: string
  currency?: string
  created_at?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawFlutterwaveRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.tx_id ?? ''),
    amount: decimalToMinor(raw.amount_refunded ?? raw.amount),
    currency: pickCurrency(raw.currency),
    status: (raw.status ?? '').toLowerCase() === 'completed' ? 'succeeded' : 'pending',
    gateway: 'flutterwave',
    metadata: strMap({}),
    createdAt: raw.created_at,
    raw,
  }
}
