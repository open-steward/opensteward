import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawFlutterwaveCustomer {
  id?: number
  email?: string
  name?: string
  phone_number?: string
  created_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawFlutterwaveCustomer): Customer {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name: raw.name,
    phone: raw.phone_number,
    gateway: 'flutterwave',
    metadata: strMap({}),
    createdAt: raw.created_at,
    raw,
  }
}
