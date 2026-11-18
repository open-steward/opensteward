import type { Refund } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawDLocalRefund {
  id?: string
  payment_id?: string
  amount?: number
  currency?: string
  status?: string
  notification_url?: string
  status_code?: string
  status_message?: string
  created_date?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawDLocalRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: (raw.status ?? '').toUpperCase() === 'SUCCESS' ? 'succeeded' : 'pending',
    gateway: 'dlocal',
    metadata: strMap({
      status_code: raw.status_code,
      status_message: raw.status_message,
    }),
    createdAt: raw.created_date,
    raw,
  }
}
