/**
 * IntaSend subscription customers (`/api/v1/subscriptions-customers/`).
 *
 * IntaSend's subscription customer is its only customer record, and maps onto
 * the canonical **Customer**. Fields are read from the documented CustomerSer
 * (OpenAPI "IntaSend API" 1.0.1):
 *
 *   "required":["created_at","customer_id","email","first_name","last_name","updated_at"]
 *
 * Field mapping:
 *   customer_id            → id / externalId (required; a record without it throws)
 *   email                  → email
 *   first_name + last_name → name
 *   address, city, state, zipcode, country → billingAddress (state → region)
 *   reference              → metadata.reference ("Third-party reference ID")
 *   created_at, updated_at → createdAt, updatedAt
 *
 * CustomerSer documents no phone, currency or balance, so those stay unset.
 *
 * Refs:
 *   https://developers.intasend.com/reference/api_v1_subscriptions_customers_list
 *   https://developers.intasend.com/docs/create-a-subscription-customer-copy
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawIntasendSubscriptionCustomer {
  customer_id?: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  reference?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  /** CountryEnum, BlankEnum ("") or null. */
  country?: string | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

/** A documented nullable string, with "" (BlankEnum) read as absent. */
function present(v: string | null | undefined): string | undefined {
  return v ? v : undefined
}

export function transformCustomer(raw: RawIntasendSubscriptionCustomer): Customer {
  if (!raw.customer_id) {
    throw new Error('IntaSend subscription customer has no customer_id')
  }
  const id = raw.customer_id

  const name =
    [raw.first_name?.trim(), raw.last_name?.trim()].filter(Boolean).join(' ') || undefined

  const line1 = present(raw.address)
  const city = present(raw.city)
  const state = present(raw.state)
  const postalCode = present(raw.zipcode)
  const country = present(raw.country)
  const billingAddress =
    line1 || city || state || postalCode || country
      ? { line1, city, region: state, postalCode, country }
      : undefined

  return {
    id,
    externalId: id,
    email: present(raw.email),
    name,
    billingAddress,
    gateway: 'intasend',
    metadata: strMap({ reference: present(raw.reference) }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
