import type { Refund } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawCybersourceRefund {
  id?: string
  status?: string
  submitTimeUtc?: string
  refundAmountDetails?: { refundAmount?: string; currency?: string }
  paymentId?: string
  clientReferenceInformation?: { code?: string }
  [k: string]: unknown
}

export function transformRefund(raw: RawCybersourceRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.paymentId ?? ''),
    amount: decimalToMinor(raw.refundAmountDetails?.refundAmount),
    currency: pickCurrency(raw.refundAmountDetails?.currency),
    status: (raw.status ?? '').toUpperCase() === 'PENDING' ? 'pending' : 'succeeded',
    gateway: 'cybersource',
    metadata: strMap({ clientReferenceCode: raw.clientReferenceInformation?.code }),
    createdAt: raw.submitTimeUtc,
    raw,
  }
}
