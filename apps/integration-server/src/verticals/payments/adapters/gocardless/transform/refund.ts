import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawGCRefund {
  id?: string
  amount?: number
  currency?: string
  reference?: string
  links?: { payment?: string; mandate?: string }
  created_at?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawGCRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.links?.payment ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: 'succeeded',
    gateway: 'gocardless',
    metadata: strMap({ reference: raw.reference }),
    createdAt: raw.created_at,
    raw,
  }
}
