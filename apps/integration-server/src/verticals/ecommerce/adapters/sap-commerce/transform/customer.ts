/**
 * SAP Commerce Cloud User → canonical Customer.
 *
 * SAP Commerce exposes customer data via the `/users/{userId}` endpoints.
 * Users are identified by `uid` (typically their email) or `customerId`.
 *
 * Address handling: SAP Commerce addresses have a rich structure with
 * `line1`, `line2`, `town`, `region.isocode`, `postalCode`, `country.isocode`.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface RawSapAddress {
  id?: string
  firstName?: string
  lastName?: string
  line1?: string
  line2?: string
  town?: string
  region?: { isocode?: string; name?: string }
  postalCode?: string
  country?: { isocode?: string; name?: string }
  phone?: string
  email?: string
  defaultAddress?: boolean
  shippingAddress?: boolean
  billingAddress?: boolean
  [key: string]: unknown
}

export interface RawSapUser {
  uid: string
  customerId?: string
  name?: string
  firstName?: string
  lastName?: string
  titleCode?: string
  title?: string
  email?: string
  displayUid?: string
  currency?: { isocode?: string }
  language?: { isocode?: string }
  defaultAddress?: RawSapAddress
  addresses?: RawSapAddress[]
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

function mapAddress(raw: RawSapAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.line1
  const line2 = raw.line2
  const city = raw.town
  const region = raw.region?.isocode ?? raw.region?.name
  const postalCode = raw.postalCode
  const country = raw.country?.isocode ?? raw.country?.name
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawSapUser): Customer {
  const addresses = raw.addresses
    ?.map(mapAddress)
    .filter((a): a is Address => !!a)
  const defaultAddr =
    raw.defaultAddress
      ? mapAddress(raw.defaultAddress)
      : raw.addresses?.find((a) => a.defaultAddress)
        ? mapAddress(raw.addresses.find((a) => a.defaultAddress))
        : addresses?.[0]

  return {
    id: raw.customerId ?? raw.uid,
    email: raw.email ?? raw.displayUid ?? raw.uid,
    firstName: raw.firstName,
    lastName: raw.lastName,
    defaultAddress: defaultAddr,
    addresses,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.modifiedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    uid: customer.email,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
  }
  if (customer.defaultAddress) {
    body['defaultAddress'] = {
      line1: customer.defaultAddress.line1,
      line2: customer.defaultAddress.line2,
      town: customer.defaultAddress.city,
      postalCode: customer.defaultAddress.postalCode,
      country: customer.defaultAddress.country
        ? { isocode: customer.defaultAddress.country }
        : undefined,
    }
  }
  return body
}

export function buildPatchForCustomer(
  updates: Partial<Customer>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (updates.email !== undefined) body['email'] = updates.email
  if (updates.firstName !== undefined) body['firstName'] = updates.firstName
  if (updates.lastName !== undefined) body['lastName'] = updates.lastName
  return body
}
