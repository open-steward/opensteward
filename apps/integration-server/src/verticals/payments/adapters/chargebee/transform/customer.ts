import type { Customer } from '../../../schema/customer'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawChargebeeCustomer {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  phone?: string
  primary_payment_source_id?: string
  preferred_currency_code?: string
  taxability?: string
  created_at?: number
  updated_at?: number
  meta_data?: Record<string, unknown>
  [k: string]: unknown
}

export function transformCustomer(raw: RawChargebeeCustomer): Customer {
  const name = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name: name || undefined,
    phone: raw.phone,
    defaultPaymentMethodId: raw.primary_payment_source_id,
    currency: raw.preferred_currency_code ? pickCurrency(raw.preferred_currency_code) : undefined,
    gateway: 'chargebee',
    metadata: strMap(raw.meta_data),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    raw,
  }
}
