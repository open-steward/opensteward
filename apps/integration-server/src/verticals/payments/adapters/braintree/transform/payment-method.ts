import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawBraintreePaymentMethod {
  id?: string
  details?: {
    __typename?: string
    brandCode?: string
    last4?: string
    expirationMonth?: string
    expirationYear?: string
    cardholderName?: string
    bin?: string
    fingerprint?: string
    email?: string
  }
  customer?: { id?: string }
  default?: boolean
  [k: string]: unknown
}

function mapType(typename: string | undefined): PaymentMethodType {
  switch (typename) {
    case 'CreditCardDetails':
      return 'card'
    case 'PayPalAccountDetails':
    case 'VenmoAccountDetails':
    case 'ApplePayCardDetails':
    case 'GooglePayCardDetails':
      return 'wallet'
    case 'UsBankAccountDetails':
    case 'SepaDirectDebitAccountDetails':
      return 'bank_account'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(raw: RawBraintreePaymentMethod): PaymentMethod {
  const det = raw.details ?? {}
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer?.id,
    type: mapType(det.__typename),
    brand: det.brandCode?.toLowerCase(),
    last4: det.last4,
    expMonth: det.expirationMonth ? parseInt(det.expirationMonth, 10) : undefined,
    expYear: det.expirationYear ? parseInt(det.expirationYear, 10) : undefined,
    holderName: det.cardholderName,
    fingerprint: det.fingerprint,
    isDefault: raw.default,
    gateway: 'braintree',
    metadata: strMap({ bin: det.bin, email: det.email }),
    raw,
  }
}
