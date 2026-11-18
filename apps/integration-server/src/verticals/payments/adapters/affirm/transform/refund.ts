import type { Refund } from '../../../schema/refund'
import { DEFAULT_CURRENCY, strMap } from './shared'

export interface RawAffirmRefund {
  id?: string
  amount?: number
  type?: string
  created?: string
  charge_id?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawAffirmRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.charge_id ?? ''),
    amount: raw.amount ?? 0,
    currency: DEFAULT_CURRENCY,
    status: 'succeeded',
    gateway: 'affirm',
    metadata: strMap({ type: raw.type }),
    createdAt: raw.created,
    raw,
  }
}
