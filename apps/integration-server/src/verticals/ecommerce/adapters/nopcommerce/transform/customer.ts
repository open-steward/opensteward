/**
 * nopCommerce Customer → canonical Customer.
 *
 * nopCommerce customer records carry billing and shipping addresses as
 * nested objects. The API returns `{ customers: [...] }` from the list
 * endpoint and `{ customers: [customer] }` from the single endpoint.
 *
 * Key fields:
 *  - `email`, `first_name`, `last_name` are top-level
 *  - `billing_address` / `shipping_address` are nested address objects
 *  - `role_ids` identifies customer roles
 *
 * Docs: https://docs.nopcommerce.com/en/developer/web-api/index.html
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawNopAddress {
  id?: number | string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state_province_name?: string | null
  zip_postal_code?: string | null
  country?: string | null
  phone_number?: string | null
  [key: string]: unknown
}

export interface RawNopCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  admin_comment?: string | null
  is_tax_exempt?: boolean
  has_shopping_cart_items?: boolean
  active?: boolean
  deleted?: boolean
  is_system_account?: boolean
  billing_address?: RawNopAddress | null
  shipping_address?: RawNopAddress | null
  role_ids?: Array<number | string>
  shopping_cart_items?: unknown[]
  created_on_utc?: string
  updated_on_utc?: string
  [key: string]: unknown
}

function mapAddress(raw: RawNopAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state_province_name ?? undefined
  const postalCode = raw.zip_postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawNopCustomer): Customer {
  const billing = mapAddress(raw.billing_address)
  const shipping = mapAddress(raw.shipping_address)
  const addresses: Address[] = []
  if (billing) addresses.push(billing)
  if (shipping && shipping !== billing) addresses.push(shipping)

  const phone = raw.billing_address?.phone_number ?? raw.shipping_address?.phone_number ?? undefined

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone,
    defaultAddress: billing,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: raw.created_on_utc,
    updatedAt: raw.updated_on_utc,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['billing_address'] = {
      first_name: customer.firstName,
      last_name: customer.lastName,
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      state_province_name: a.region,
      zip_postal_code: a.postalCode,
      country: a.country,
      email: customer.email,
      phone_number: customer.phone,
    }
    body['shipping_address'] = {
      first_name: customer.firstName,
      last_name: customer.lastName,
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      state_province_name: a.region,
      zip_postal_code: a.postalCode,
      country: a.country,
    }
  }
  return body
}
