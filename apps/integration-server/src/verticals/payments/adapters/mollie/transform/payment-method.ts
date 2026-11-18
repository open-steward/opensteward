import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawMollieMandate {
  id?: string
  customerId?: string
  method?: string
  status?: string
  details?: {
    consumerName?: string
    consumerAccount?: string
    cardHolder?: string
    cardNumber?: string
    cardLabel?: string
    cardExpiryDate?: string
  }
  createdAt?: string
  [k: string]: unknown
}

function mapType(method: string | undefined): PaymentMethodType {
  switch ((method ?? '').toLowerCase()) {
    case 'creditcard':
      return 'card'
    case 'directdebit':
    case 'paypal':
      return method === 'paypal' ? 'wallet' : 'bank_account'
    case 'klarna':
      return 'bnpl'
    default:
      return 'mandate'
  }
}

export function transformPaymentMethod(raw: RawMollieMandate): PaymentMethod {
  const last4 =
    raw.details?.cardNumber?.slice(-4) ?? raw.details?.consumerAccount?.slice(-4)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customerId,
    type: mapType(raw.method),
    brand: raw.details?.cardLabel ?? raw.method,
    last4,
    holderName: raw.details?.consumerName ?? raw.details?.cardHolder,
    gateway: 'mollie',
    metadata: strMap({ status: raw.status }),
    createdAt: raw.createdAt,
    raw,
  }
}
