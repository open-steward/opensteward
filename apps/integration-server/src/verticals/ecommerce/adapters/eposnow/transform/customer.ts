/**
 * Epos Now Customer -> canonical Customer.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawEposNowCustomer {
  Id?: number
  FirstName?: string
  LastName?: string
  EmailAddress?: string
  PhoneNumber?: string
  OptInMarketing?: boolean
  Address1?: string
  Address2?: string
  Town?: string
  County?: string
  PostCode?: string
  Country?: string
  CreatedDate?: string
  LastUpdatedDate?: string
  [key: string]: unknown
}

function mapAddress(raw: RawEposNowCustomer): Address | undefined {
  const line1 = raw.Address1 ?? undefined
  const line2 = raw.Address2 ?? undefined
  const city = raw.Town ?? undefined
  const region = raw.County ?? undefined
  const postalCode = raw.PostCode ?? undefined
  const country = raw.Country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawEposNowCustomer): Customer {
  return {
    id: String(raw.Id ?? ''),
    email: raw.EmailAddress ?? undefined,
    firstName: raw.FirstName ?? undefined,
    lastName: raw.LastName ?? undefined,
    phone: raw.PhoneNumber ?? undefined,
    acceptsMarketing: raw.OptInMarketing ?? undefined,
    defaultAddress: mapAddress(raw),
    createdAt: raw.CreatedDate ?? undefined,
    updatedAt: raw.LastUpdatedDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer -> Epos Now customer body for create/update. */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (customer.firstName != null) body['FirstName'] = customer.firstName
  if (customer.lastName != null) body['LastName'] = customer.lastName
  if (customer.email != null) body['EmailAddress'] = customer.email
  if (customer.phone != null) body['PhoneNumber'] = customer.phone
  if (customer.acceptsMarketing != null) body['OptInMarketing'] = customer.acceptsMarketing
  if (customer.defaultAddress) {
    if (customer.defaultAddress.line1 != null) body['Address1'] = customer.defaultAddress.line1
    if (customer.defaultAddress.line2 != null) body['Address2'] = customer.defaultAddress.line2
    if (customer.defaultAddress.city != null) body['Town'] = customer.defaultAddress.city
    if (customer.defaultAddress.region != null) body['County'] = customer.defaultAddress.region
    if (customer.defaultAddress.postalCode != null) body['PostCode'] = customer.defaultAddress.postalCode
    if (customer.defaultAddress.country != null) body['Country'] = customer.defaultAddress.country
  }
  return body
}
