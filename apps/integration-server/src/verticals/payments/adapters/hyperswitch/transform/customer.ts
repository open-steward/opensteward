/**
 * Hyperswitch CustomerResponse → canonical Customer.
 *
 * Docs: https://api-reference.hyperswitch.io/api-reference/customers/customers--retrieve
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawHyperswitchCustomer {
  customer_id?: string
  name?: string | null
  email?: string | null
  phone?: string | null
  phone_country_code?: string | null
  description?: string | null
  default_payment_method_id?: string | null
  created_at?: string | null
  metadata?: Record<string, unknown> | null
  [k: string]: unknown
}

export function transformCustomer(raw: RawHyperswitchCustomer): Customer {
  const id = String(raw.customer_id ?? '')
  const phone =
    raw.phone && raw.phone_country_code
      ? `${raw.phone_country_code}${raw.phone}`
      : (raw.phone ?? undefined)
  return {
    id,
    externalId: id,
    email: raw.email ?? undefined,
    name: raw.name ?? undefined,
    phone,
    defaultPaymentMethodId: raw.default_payment_method_id ?? undefined,
    description: raw.description ?? undefined,
    gateway: 'hyperswitch',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
