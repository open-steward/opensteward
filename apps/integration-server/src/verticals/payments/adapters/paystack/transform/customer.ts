import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawPaystackCustomer {
  id?: number
  customer_code?: string
  email?: string
  first_name?: string
  last_name?: string
  phone?: string
  metadata?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawPaystackCustomer): Customer {
  const name = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.id ?? raw.customer_code ?? ''),
    externalId: String(raw.customer_code ?? raw.id ?? ''),
    email: raw.email,
    name: name || undefined,
    phone: raw.phone,
    gateway: 'paystack',
    metadata: strMap(raw.metadata),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    raw,
  }
}
