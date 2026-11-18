import { requireAmount } from '@opensteward/shared'

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawWorldpayPayment {
  paymentId?: string
  outcome?: string
  value?: { amount?: number; currency?: string }
  description?: string
  reference?: { transactionReference?: string }
  riskFactors?: unknown
  authentication?: unknown
  lastEvent?: string
  lastEventDateTime?: string
  [k: string]: unknown
}

function mapStatus(raw: RawWorldpayPayment): ChargeStatus {
  switch ((raw.outcome ?? raw.lastEvent ?? '').toLowerCase()) {
    case 'authorized':
    case 'authorised':
      return 'pending'
    case 'sentforauthorisation':
    case 'sentforauthorization':
      return 'pending'
    case 'settled':
    case 'sentforsettlement':
      return 'succeeded'
    case 'refused':
    case 'failed':
    case 'error':
      return 'failed'
    case 'cancelled':
    case 'canceled':
    case 'voided':
      return 'cancelled'
    case 'refunded':
      return 'refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawWorldpayPayment): Charge {
  return {
    id: String(raw.paymentId ?? ''),
    externalId: String(raw.paymentId ?? ''),
    amount: requireAmount(raw.value?.amount, 'worldpay-fis charge'),
    currency: pickCurrency(raw.value?.currency),
    status: mapStatus(raw),
    description: raw.description,
    gateway: 'worldpay-fis',
    metadata: strMap({ transactionReference: raw.reference?.transactionReference }),
    createdAt: raw.lastEventDateTime,
    raw,
  }
}
