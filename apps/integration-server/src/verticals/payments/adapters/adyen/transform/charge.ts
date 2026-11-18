import { requireAmount } from '@opensteward/shared'

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawAdyenPaymentResponse {
  pspReference?: string
  merchantReference?: string
  resultCode?: string
  amount?: { value?: number; currency?: string }
  refusalReason?: string
  refusalReasonCode?: string
  shopperReference?: string
  shopperEmail?: string
  additionalData?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawAdyenPaymentResponse): ChargeStatus {
  switch ((raw.resultCode ?? '').toLowerCase()) {
    case 'authorised':
    case 'authorized':
      return 'succeeded'
    case 'pending':
    case 'received':
      return 'pending'
    case 'refused':
    case 'error':
    case 'cancelled':
      return raw.resultCode === 'Cancelled' ? 'cancelled' : 'failed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawAdyenPaymentResponse): Charge {
  return {
    id: String(raw.pspReference ?? ''),
    externalId: String(raw.pspReference ?? ''),
    amount: requireAmount(raw.amount?.value, 'adyen charge'),
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    customerId: raw.shopperReference,
    receiptEmail: raw.shopperEmail,
    failureCode: raw.refusalReasonCode,
    failureMessage: raw.refusalReason,
    gateway: 'adyen',
    metadata: strMap({ merchantReference: raw.merchantReference }),
    raw,
  }
}
