import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawBraintreeCustomer {
  id?: string
  legacyId?: string
  email?: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  company?: string
  createdAt?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawBraintreeCustomer): Customer {
  const name = [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() || undefined
  return {
    id: String(raw.id ?? raw.legacyId ?? ''),
    externalId: String(raw.id ?? raw.legacyId ?? ''),
    email: raw.email,
    name,
    phone: raw.phoneNumber,
    description: raw.company,
    gateway: 'braintree',
    metadata: strMap({}),
    createdAt: raw.createdAt,
    raw,
  }
}
