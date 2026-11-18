import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawMoyasarToken {
  [k: string]: unknown
}

function mapType(brand: string | undefined | null): PaymentMethodType {
  if (!brand) return 'card'
  const b = brand.toLowerCase()
  if (b === 'stc_pay' || b === 'stcpay' || b === 'apple_pay' || b === 'applepay' || b === 'google_pay') return 'wallet'
  return 'card'
}

export function transformPaymentMethod(raw: RawMoyasarToken): PaymentMethod {
  const brand = raw['brand'] != null ? String(raw['brand']) : undefined
  const month = raw['month'] != null ? parseInt(String(raw['month']), 10) : undefined
  const year = raw['year'] != null ? parseInt(String(raw['year']), 10) : undefined

  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    type: mapType(brand),
    brand,
    last4: raw['last_four'] != null ? String(raw['last_four']) : undefined,
    expMonth: isFinite(month as number) ? month : undefined,
    expYear: isFinite(year as number) ? year : undefined,
    holderName: raw['name'] != null ? String(raw['name']) : undefined,
    gateway: 'moyasar',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    updatedAt: raw['updated_at'] != null ? String(raw['updated_at']) : undefined,
    raw,
  }
}
