/**
 * Magento Customer → canonical Customer.
 *
 * Magento customers live under `/V1/customers` and expose an
 * `addresses` array where each address has an `id`, optional
 * `default_billing` / `default_shipping` flags, and a `region.region`
 * string carrying the state/province.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface RawMagentoRegion {
  region_code?: string
  region?: string
  region_id?: number
}

export interface RawMagentoAddress {
  id?: number
  customer_id?: number
  region?: RawMagentoRegion
  region_id?: number
  country_id?: string
  street?: string[]
  telephone?: string
  postcode?: string
  city?: string
  firstname?: string
  lastname?: string
  default_shipping?: boolean
  default_billing?: boolean
  [key: string]: unknown
}

export interface RawMagentoCustomer {
  id: number
  group_id?: number
  default_billing?: string | number
  default_shipping?: string | number
  created_at?: string
  updated_at?: string
  created_in?: string
  email?: string
  firstname?: string
  lastname?: string
  store_id?: number
  website_id?: number
  addresses?: RawMagentoAddress[]
  disable_auto_group_change?: number
  extension_attributes?: Record<string, unknown>
  custom_attributes?: Array<{ attribute_code: string; value: unknown }>
  [key: string]: unknown
}

function mapAddress(raw: RawMagentoAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street?.[0]
  const line2 = raw.street && raw.street.length > 1 ? raw.street[1] : undefined
  const city = raw.city
  const region = raw.region?.region ?? raw.region?.region_code
  const postalCode = raw.postcode
  const country = raw.country_id
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawMagentoCustomer): Customer {
  const addresses = (raw.addresses ?? []).map(mapAddress).filter(
    (a): a is Address => a != null,
  )
  const defaultBillingRaw = raw.addresses?.find((a) => a.default_billing)
  const defaultBilling = mapAddress(defaultBillingRaw) ?? addresses[0]
  const phone = defaultBillingRaw?.telephone

  return {
    id: String(raw.id),
    email: raw.email,
    firstName: raw.firstname,
    lastName: raw.lastname,
    phone,
    defaultAddress: defaultBilling,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    customer: {
      email: customer.email,
      firstname: customer.firstName,
      lastname: customer.lastName,
    },
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    ;(body['customer'] as Record<string, unknown>)['addresses'] = [
      {
        firstname: customer.firstName,
        lastname: customer.lastName,
        street: a.line1 ? [a.line1, a.line2].filter(Boolean) : undefined,
        city: a.city,
        region: a.region ? { region: a.region } : undefined,
        postcode: a.postalCode,
        country_id: a.country,
        telephone: customer.phone,
        default_billing: true,
        default_shipping: true,
      },
    ]
  }
  return body
}
