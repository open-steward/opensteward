import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawAdyenStoredPaymentMethod {
  id?: string
  shopperReference?: string
  type?: string
  brand?: string
  lastFour?: string
  expiryMonth?: string
  expiryYear?: string
  holderName?: string
  iban?: string
  ownerName?: string
  bankAccountNumber?: string
  [k: string]: unknown
}

function mapType(raw: string | undefined): PaymentMethodType {
  switch ((raw ?? '').toLowerCase()) {
    case 'scheme':
    case 'card':
      return 'card'
    case 'sepadirectdebit':
    case 'bcmc':
    case 'ach':
      return 'bank_account'
    case 'klarna':
    case 'afterpaytouch':
    case 'affirm':
      return 'bnpl'
    case 'paypal':
    case 'applepay':
    case 'googlepay':
      return 'wallet'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(raw: RawAdyenStoredPaymentMethod): PaymentMethod {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.shopperReference,
    type: mapType(raw.type),
    brand: raw.brand ?? raw.type,
    last4: raw.lastFour ?? raw.bankAccountNumber?.slice(-4),
    expMonth: raw.expiryMonth ? parseInt(raw.expiryMonth, 10) : undefined,
    expYear: raw.expiryYear ? parseInt(raw.expiryYear, 10) : undefined,
    holderName: raw.holderName ?? raw.ownerName,
    gateway: 'adyen',
    metadata: strMap({}),
    raw,
  }
}
