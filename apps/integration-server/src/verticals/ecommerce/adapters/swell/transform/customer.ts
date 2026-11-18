/**
 * Swell account → canonical Customer.
 *
 * Fields read, from the account model
 * (https://developers.swell.is/backend-api/accounts):
 *   id, email, first_name, last_name, phone ("Customer's phone number."),
 *   email_optin ("Indicates the customer opted into email communications."),
 *   order_count ("Number of orders the customer has placed over time."),
 *   order_value ("Total value of all orders the customer has placed over
 *   time."), currency ("Three-letter ISO currency code in uppercase."),
 *   shipping / billing { address1, address2, city, state, zip, country },
 *   date_created, date_updated.
 *
 * The documented example sends `zip` as a number (`"zip": 11201`), so it is
 * stringified. `totalSpent` needs both `order_value` and `currency`.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawSwellAddress {
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | number | null
  country?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface RawSwellAccount {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email_optin?: boolean | null
  order_count?: number | null
  order_value?: number | null
  currency?: string | null
  shipping?: RawSwellAddress | null
  billing?: RawSwellAddress | null
  date_created?: string | null
  date_updated?: string | null
  [key: string]: unknown
}

/** A Swell address object (accounts, orders) → canonical Address. */
export function mapSwellAddress(raw: RawSwellAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zip != null && raw.zip !== '' ? String(raw.zip) : undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

export function transformCustomer(raw: RawSwellAccount): Customer {
  const shipping = mapSwellAddress(raw.shipping)
  const billing = mapSwellAddress(raw.billing)
  const addresses = [shipping, billing].filter((a): a is Address => a != null)
  const currency = raw.currency ?? undefined

  return {
    id: raw.id,
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.email_optin ?? undefined,
    ordersCount: raw.order_count ?? undefined,
    totalSpent:
      raw.order_value != null && currency
        ? { amount: majorToMinor(raw.order_value, currency), currency }
        : undefined,
    defaultAddress: shipping ?? billing,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.date_created ?? undefined,
    updatedAt: raw.date_updated ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (customer.email !== undefined) body['email'] = customer.email
  if (customer.firstName !== undefined) body['first_name'] = customer.firstName
  if (customer.lastName !== undefined) body['last_name'] = customer.lastName
  if (customer.phone !== undefined) body['phone'] = customer.phone
  if (customer.defaultAddress) {
    body['shipping'] = {
      address1: customer.defaultAddress.line1,
      address2: customer.defaultAddress.line2,
      city: customer.defaultAddress.city,
      state: customer.defaultAddress.region,
      zip: customer.defaultAddress.postalCode,
      country: customer.defaultAddress.country,
    }
  }
  return body
}
