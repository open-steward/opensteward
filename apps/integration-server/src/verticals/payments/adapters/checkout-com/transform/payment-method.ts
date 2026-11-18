import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawCheckoutInstrument {
  id?: string
  type?: string
  customer?: { id?: string }
  last4?: string
  expiry_month?: number
  expiry_year?: number
  scheme?: string
  fingerprint?: string
  account_holder?: { first_name?: string; last_name?: string }
  [k: string]: unknown
}

function mapType(t: string | undefined): PaymentMethodType {
  switch ((t ?? '').toLowerCase()) {
    case 'card':
      return 'card'
    case 'sepa':
    case 'ach':
      return 'bank_account'
    case 'klarna':
      return 'bnpl'
    case 'googlepay':
    case 'applepay':
      return 'wallet'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(raw: RawCheckoutInstrument): PaymentMethod {
  const fullName = [raw.account_holder?.first_name, raw.account_holder?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer?.id,
    type: mapType(raw.type),
    brand: raw.scheme?.toLowerCase(),
    last4: raw.last4,
    expMonth: raw.expiry_month,
    expYear: raw.expiry_year,
    holderName: fullName || undefined,
    fingerprint: raw.fingerprint,
    gateway: 'checkout-com',
    metadata: strMap({}),
    raw,
  }
}
