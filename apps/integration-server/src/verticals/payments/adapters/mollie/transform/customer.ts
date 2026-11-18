import type { Customer } from '../../../schema/customer'
import { pickCurrency, strMap } from './shared'

export interface RawMollieCustomer {
  id?: string
  name?: string
  email?: string
  locale?: string
  metadata?: Record<string, unknown>
  createdAt?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawMollieCustomer): Customer {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name: raw.name,
    currency: raw.locale ? pickCurrency(raw.locale.split('_')[1]) : undefined,
    gateway: 'mollie',
    metadata: strMap(raw.metadata),
    createdAt: raw.createdAt,
    raw,
  }
}
