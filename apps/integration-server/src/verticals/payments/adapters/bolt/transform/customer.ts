import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

/**
 * A Bolt shopper / account. Bolt models the buyer as an account identified by
 * `id`; name arrives split into `first_name` / `last_name`.
 */
export interface RawBoltShopper {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  name?: string
  phone?: string
  default_currency?: string
  date_created?: string
  created_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

export function transformCustomer(raw: RawBoltShopper): Customer {
  const name = raw.name ?? [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name: name || undefined,
    phone: raw.phone,
    currency: raw.default_currency ? raw.default_currency.toUpperCase() : undefined,
    gateway: 'bolt',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.date_created ?? raw.created_at),
    raw,
  }
}
