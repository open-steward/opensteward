/**
 * Airwallex Customer → canonical Customer.
 *
 * Airwallex names are split into `first_name` / `last_name` (often nested under
 * `additional_info`); `merchant_customer_id` is the merchant's own reference.
 * Timestamps are ISO-8601 with a `+0000` offset and are normalised via
 * `toIsoDatetime`.
 *
 * Ref: https://www.airwallex.com/docs/api/payments/customers
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawAirwallexCustomer {
  id?: string
  merchant_customer_id?: string
  email?: string
  phone_number?: string
  first_name?: string
  last_name?: string
  additional_info?: {
    first_name?: string
    last_name?: string
    [k: string]: unknown
  }
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawAirwallexCustomer): Customer {
  const first = raw.first_name ?? raw.additional_info?.first_name
  const last = raw.last_name ?? raw.additional_info?.last_name
  const name = [first, last].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.id ?? raw.merchant_customer_id ?? ''),
    externalId: String(raw.id ?? raw.merchant_customer_id ?? ''),
    email: raw.email ?? undefined,
    name: name || undefined,
    phone: raw.phone_number ?? undefined,
    gateway: 'airwallex',
    metadata: strMap({ ...raw.metadata, merchant_customer_id: raw.merchant_customer_id }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
