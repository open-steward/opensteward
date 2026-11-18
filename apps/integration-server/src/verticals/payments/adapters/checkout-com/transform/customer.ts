import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawCheckoutCustomer {
  id?: string
  email?: string
  name?: string
  phone?: { country_code?: string; number?: string }
  default?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawCheckoutCustomer): Customer {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name: raw.name,
    phone: raw.phone?.number,
    defaultPaymentMethodId: raw.default,
    gateway: 'checkout-com',
    metadata: strMap({}),
    raw,
  }
}
