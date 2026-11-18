import type { Refund } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMPRefund {
  id?: number | string
  payment_id?: number | string
  amount?: number
  source?: { name?: string; type?: string; id?: string }
  status?: string
  date_created?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawMPRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(undefined),
    status: raw.status === 'approved' ? 'succeeded' : 'pending',
    gateway: 'mercado-pago',
    metadata: strMap({ source_name: raw.source?.name, source_id: raw.source?.id }),
    createdAt: raw.date_created,
    raw,
  }
}
