import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawDLocalCard {
  card_id?: string
  holder_name?: string
  expiration_month?: number | string
  expiration_year?: number | string
  brand?: string
  last4?: string
  [k: string]: unknown
}

function mapType(brand: string | undefined): PaymentMethodType {
  if (!brand) return 'card'
  return 'card'
}

export function transformPaymentMethod(raw: RawDLocalCard): PaymentMethod {
  const expMonth = raw.expiration_month != null ? Number(raw.expiration_month) : undefined
  const expYear = raw.expiration_year != null ? Number(raw.expiration_year) : undefined

  return {
    id: String(raw.card_id ?? ''),
    externalId: String(raw.card_id ?? ''),
    type: mapType(raw.brand),
    brand: raw.brand?.toLowerCase(),
    last4: raw.last4,
    expMonth: Number.isFinite(expMonth) ? expMonth : undefined,
    expYear: Number.isFinite(expYear) ? expYear : undefined,
    holderName: raw.holder_name,
    gateway: 'dlocal',
    metadata: strMap({}),
    raw,
  }
}
