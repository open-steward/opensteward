/**
 * KORONA Customer → canonical Customer.
 *
 * Shape verified against `components.schemas.Customer` on
 * https://128.koronacloud.com/web/api/v3/openapi.json — unlike IdoSell,
 * `firstname`/`lastname`/`email`/`phone` are top-level fields, not nested
 * under a billing-address object.
 */

import { isIso3166Alpha2, toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import type { KoronaAddressInformation } from './location'

export interface KoronaCustomer {
  id: string
  number?: string
  email?: string
  firstname?: string
  lastname?: string
  phone?: string
  address?: KoronaAddressInformation
  marketingContactPermitted?: boolean
  createTime?: string
}

function mapAddress(raw: KoronaAddressInformation | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.addressLine1 ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.zipCode ?? undefined
  const upperCountry = raw.country?.toUpperCase()
  const country = upperCountry && isIso3166Alpha2(upperCountry) ? upperCountry : undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2: raw.addressLine2 ?? undefined, city, region: raw.state ?? undefined, postalCode, country }
}

export function transformCustomer(raw: KoronaCustomer): Customer {
  return {
    id: raw.id,
    email: raw.email || undefined,
    firstName: raw.firstname || undefined,
    lastName: raw.lastname || undefined,
    phone: raw.phone || undefined,
    acceptsMarketing: raw.marketingContactPermitted,
    defaultAddress: mapAddress(raw.address),
    createdAt: toIsoDatetime(raw.createTime),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → KORONA body for `POST /customers` (add,
 *  array-batched) / `PATCH /customers/{id}` (edit). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstname: customer.firstName,
    lastname: customer.lastName,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['address'] = {
      addressLine1: a.line1,
      addressLine2: a.line2,
      city: a.city,
      state: a.region,
      zipCode: a.postalCode,
      country: a.country,
    }
  }
  return body
}
