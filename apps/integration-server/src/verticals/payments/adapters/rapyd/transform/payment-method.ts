import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { pickStr, strMap } from './shared'

/**
 * Rapyd customer payment method, as List Payment Methods of Customer
 * documents it (https://docs.rapyd.net/en/list-payment-methods-of-customer.html).
 * Only the documented fields this transform reads are typed. The record
 * carries no customer id; the customer comes from the request path
 * (`/v1/customers/:customer/payment_methods`) and is passed in.
 *
 *   category          bank_redirect | bank_transfer | card | card_redirect |
 *                     cash | ewallet | ewallet_redirect
 *   type              "Name of the payment method type. For example, us_mastercard_card."
 *   last4             "Last four digits of the card or IBAN"
 *   expiration_month  "Month of expiration." (the string "12" in the example)
 *   expiration_year   "Year of expiration." (the two-digit string "35" in the example)
 *   bin_details.brand "The brand of the card. For example, Visa."
 *   fingerprint_token "Hash of the card number, expiration date and CVV."
 */
export interface RawRapydPaymentMethod {
  id?: string
  type?: string
  category?: string
  last4?: string
  name?: string
  expiration_month?: string | number
  expiration_year?: string | number
  fingerprint_token?: string
  is_default?: boolean
  bin_details?: { brand?: string } | null
  metadata?: Record<string, unknown> | null
  [k: string]: unknown
}

function mapCategory(category: unknown): PaymentMethodType {
  switch (category) {
    case 'card':
    case 'card_redirect':
      return 'card'
    case 'bank_transfer':
      return 'bank_account'
    case 'bank_redirect':
      return 'a2a'
    case 'ewallet':
    case 'ewallet_redirect':
      return 'wallet'
    case 'cash':
      return 'other'
    default:
      return 'unknown'
  }
}

function month(v: unknown): number | undefined {
  const n = typeof v === 'string' && /^\d{1,2}$/.test(v) ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined
}

/**
 * Only a four-digit year is used. The documented example gives a two-digit
 * "35", and the docs do not say which century that is, so it is left out.
 */
function year(v: unknown): number | undefined {
  const n = typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= 1000 && n <= 9999 ? n : undefined
}

export function transformPaymentMethod(
  raw: RawRapydPaymentMethod,
  customerId?: string,
): PaymentMethod {
  const id = pickStr(raw.id)
  if (!id) throw new Error('Rapyd payment method has no id')
  return {
    id,
    externalId: id,
    customerId,
    type: mapCategory(raw.category),
    brand: pickStr(raw.bin_details?.brand),
    last4: pickStr(raw.last4),
    expMonth: month(raw.expiration_month),
    expYear: year(raw.expiration_year),
    holderName: pickStr(raw.name),
    isDefault: typeof raw.is_default === 'boolean' ? raw.is_default : undefined,
    fingerprint: pickStr(raw.fingerprint_token),
    gateway: 'rapyd',
    metadata: strMap(raw.metadata),
    raw,
  }
}
