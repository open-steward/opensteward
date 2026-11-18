import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawAuthNetCustomerProfile {
  customerProfileId?: string
  merchantCustomerId?: string
  email?: string
  description?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawAuthNetCustomerProfile): Customer {
  return {
    id: String(raw.customerProfileId ?? ''),
    externalId: String(raw.customerProfileId ?? ''),
    email: raw.email,
    name: raw.merchantCustomerId,
    description: raw.description,
    gateway: 'authorize-net',
    metadata: strMap({ merchantCustomerId: raw.merchantCustomerId }),
    raw,
  }
}
