import type { Refund } from '../../../schema/refund'
import { decimalToMinor, strMap } from './shared'

export interface RawAuthNetRefund {
  transId?: string
  refTransId?: string
  authAmount?: string
  responseCode?: string
  submitTimeUTC?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawAuthNetRefund): Refund {
  return {
    id: String(raw.transId ?? ''),
    externalId: String(raw.transId ?? ''),
    chargeId: String(raw.refTransId ?? ''),
    amount: decimalToMinor(raw.authAmount),
    currency: 'USD',
    status: raw.responseCode === '1' ? 'succeeded' : 'pending',
    gateway: 'authorize-net',
    metadata: strMap({ responseCode: raw.responseCode }),
    createdAt: raw.submitTimeUTC,
    raw,
  }
}
