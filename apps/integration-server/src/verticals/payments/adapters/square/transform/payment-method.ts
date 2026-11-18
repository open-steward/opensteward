import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawSquareCard {
  id?: string
  customer_id?: string
  card_brand?: string
  last_4?: string
  exp_month?: number
  exp_year?: number
  cardholder_name?: string
  fingerprint?: string
  enabled?: boolean
  card_type?: string
  prepaid_type?: string
  bin?: string
  [k: string]: unknown
}

function mapType(_raw: string | undefined): PaymentMethodType {
  // Square /v2/cards stores card tokens; for ACH and gift-cards the adapter
  // surfaces separate endpoints not modelled here in v1.
  return 'card'
}

export function transformPaymentMethod(raw: RawSquareCard): PaymentMethod {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer_id,
    type: mapType(raw.card_type),
    brand: raw.card_brand?.toLowerCase(),
    last4: raw.last_4,
    expMonth: raw.exp_month,
    expYear: raw.exp_year,
    holderName: raw.cardholder_name,
    fingerprint: raw.fingerprint,
    gateway: 'square',
    metadata: strMap({ card_type: raw.card_type, prepaid_type: raw.prepaid_type, bin: raw.bin }),
    raw,
  }
}
