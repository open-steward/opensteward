/**
 * Conekta `Customer` — first-class resource at `/customers`. `created_at` is
 * Unix epoch seconds; there is no `updated_at`. `default_payment_source_id`
 * is the customer's default card/source.
 *
 * Refs:
 *   https://developers.conekta.com/reference/getcustomers
 *   https://developers.conekta.com/reference/getcustomerbyid
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawConektaCustomer {
  id?: string
  object?: string
  name?: string
  email?: string
  phone?: string
  default_payment_source_id?: string
  corporate?: boolean
  custom_reference?: string
  created_at?: number
  metadata?: Record<string, unknown>
  livemode?: boolean
  [k: string]: unknown
}

export function transformCustomer(raw: RawConektaCustomer): Customer {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name: raw.name,
    phone: raw.phone,
    defaultPaymentMethodId: raw.default_payment_source_id,
    gateway: 'conekta',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
