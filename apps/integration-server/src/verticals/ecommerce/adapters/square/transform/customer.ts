/**
 * Square Customer → canonical Customer.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawSquareAddress {
  address_line_1?: string
  address_line_2?: string
  locality?: string
  administrative_district_level_1?: string
  postal_code?: string
  country?: string
}

export interface RawSquareCustomer {
  id: string
  email_address?: string | null
  given_name?: string | null
  family_name?: string | null
  phone_number?: string | null
  address?: RawSquareAddress | null
  preferences?: { email_unsubscribed?: boolean }
  creation_source?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawSquareAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_line_1 ?? undefined
  const line2 = raw.address_line_2 ?? undefined
  const city = raw.locality ?? undefined
  const region = raw.administrative_district_level_1 ?? undefined
  const postalCode = raw.postal_code ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawSquareCustomer): Customer {
  const acceptsMarketing =
    raw.preferences?.email_unsubscribed != null
      ? !raw.preferences.email_unsubscribed
      : undefined
  return {
    id: raw.id,
    email: raw.email_address ?? undefined,
    firstName: raw.given_name ?? undefined,
    lastName: raw.family_name ?? undefined,
    phone: raw.phone_number ?? undefined,
    acceptsMarketing,
    defaultAddress: mapAddress(raw.address),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Square customer body. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email_address: customer.email,
    given_name: customer.firstName,
    family_name: customer.lastName,
    phone_number: customer.phone,
  }
  if (customer.defaultAddress) {
    body.address = {
      address_line_1: customer.defaultAddress.line1,
      address_line_2: customer.defaultAddress.line2,
      locality: customer.defaultAddress.city,
      administrative_district_level_1: customer.defaultAddress.region,
      postal_code: customer.defaultAddress.postalCode,
      country: customer.defaultAddress.country,
    }
  }
  return body
}
