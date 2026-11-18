import { requireAmount } from '@opensteward/shared'

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawCheckoutPayment {
  id?: string
  amount?: number
  currency?: string
  approved?: boolean
  status?: string
  customer?: { id?: string; email?: string }
  source?: { id?: string; type?: string }
  reference?: string
  description?: string
  requested_on?: string
  [k: string]: unknown
}

function mapStatus(raw: RawCheckoutPayment): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'captured':
    case 'paid':
      return 'succeeded'
    case 'authorized':
    case 'pending':
      return 'pending'
    case 'declined':
    case 'expired':
    case 'failed':
      return 'failed'
    case 'voided':
    case 'cancelled':
      return 'cancelled'
    case 'refunded':
      return 'refunded'
    default:
      return raw.approved ? 'succeeded' : 'pending'
  }
}

export function transformCharge(raw: RawCheckoutPayment): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: requireAmount(raw.amount, 'checkout-com charge'),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    customerId: raw.customer?.id,
    paymentMethodId: raw.source?.id,
    receiptEmail: raw.customer?.email,
    description: raw.description,
    gateway: 'checkout-com',
    metadata: strMap({ reference: raw.reference }),
    createdAt: raw.requested_on,
    raw,
  }
}
