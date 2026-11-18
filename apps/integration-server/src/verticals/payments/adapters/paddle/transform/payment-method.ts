/**
 * Paddle saved payment method → canonical `PaymentMethod`.
 *
 * Endpoint: GET /customers/{customer_id}/payment-methods
 * Single:   GET /customers/{customer_id}/payment-methods/{payment_method_id}
 *
 * Payment methods are customer-scoped in Paddle Billing. The `type` field
 * carries values like `card`, `paypal`, `apple_pay`, `google_pay`, etc.
 * Card details (brand, last4, expiry) live in a nested `card` object.
 */
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawPaddlePaymentMethod {
  id?: string
  customer_id?: string
  address_id?: string
  type?: string
  card?: {
    type?: string
    last4?: string
    expiry_month?: number
    expiry_year?: number
    cardholder_name?: string
  }
  paypal?: {
    email?: string
    reference?: string
  }
  origin?: string
  saved_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapType(raw: RawPaddlePaymentMethod): PaymentMethodType {
  switch ((raw.type ?? '').toLowerCase()) {
    case 'card':
      return 'card'
    case 'paypal':
    case 'apple_pay':
    case 'google_pay':
    case 'wire_transfer':
      return 'wallet'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(raw: RawPaddlePaymentMethod): PaymentMethod {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer_id,
    type: mapType(raw),
    brand: raw.card?.type,
    last4: raw.card?.last4,
    expMonth: raw.card?.expiry_month,
    expYear: raw.card?.expiry_year,
    holderName: raw.card?.cardholder_name ?? raw.paypal?.email,
    gateway: 'paddle',
    metadata: strMap({
      paddle_type: raw.type,
      address_id: raw.address_id,
      origin: raw.origin,
      paypal_reference: raw.paypal?.reference,
    }),
    createdAt: raw.saved_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
