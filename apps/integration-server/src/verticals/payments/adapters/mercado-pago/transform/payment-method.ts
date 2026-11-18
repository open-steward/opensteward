import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawMPCard {
  id?: string
  customer_id?: string
  last_four_digits?: string
  expiration_month?: number
  expiration_year?: number
  payment_method?: { id?: string; name?: string; type?: string }
  cardholder?: { name?: string }
  date_created?: string
  [k: string]: unknown
}

function mapType(t: string | undefined): PaymentMethodType {
  switch ((t ?? '').toLowerCase()) {
    case 'credit_card':
    case 'debit_card':
      return 'card'
    case 'bank_transfer':
    case 'ticket':
      return 'bank_account'
    case 'digital_wallet':
      return 'wallet'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(raw: RawMPCard): PaymentMethod {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer_id,
    type: mapType(raw.payment_method?.type),
    brand: raw.payment_method?.name,
    last4: raw.last_four_digits,
    expMonth: raw.expiration_month,
    expYear: raw.expiration_year,
    holderName: raw.cardholder?.name,
    gateway: 'mercado-pago',
    metadata: strMap({ payment_method_id: raw.payment_method?.id }),
    createdAt: raw.date_created,
    raw,
  }
}
