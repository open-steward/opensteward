/**
 * commercetools Customer → canonical Customer.
 *
 * commercetools customers carry separate `defaultShippingAddressId` /
 * `defaultBillingAddressId` pointers into their addresses array.
 * The canonical schema has a single `defaultAddress`, so we prefer
 * shipping over billing when both are set.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawCtAddress {
  id?: string
  key?: string
  title?: string
  salutation?: string
  firstName?: string
  lastName?: string
  streetName?: string
  streetNumber?: string
  additionalStreetInfo?: string
  postalCode?: string
  city?: string
  region?: string
  state?: string
  country?: string
  company?: string
  phone?: string
  mobile?: string
  email?: string
  [key: string]: unknown
}

export interface RawCtCustomer {
  id: string
  version?: number
  key?: string
  customerNumber?: string
  email: string
  firstName?: string
  lastName?: string
  middleName?: string
  title?: string
  dateOfBirth?: string
  companyName?: string
  vatId?: string
  addresses?: RawCtAddress[]
  defaultShippingAddressId?: string
  defaultBillingAddressId?: string
  shippingAddressIds?: string[]
  billingAddressIds?: string[]
  isEmailVerified?: boolean
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

function mapAddress(raw: RawCtAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1Parts: string[] = []
  if (raw.streetName) line1Parts.push(raw.streetName)
  if (raw.streetNumber) line1Parts.push(raw.streetNumber)
  const line1 = line1Parts.length > 0 ? line1Parts.join(' ') : undefined
  const line2 = raw.additionalStreetInfo
  const city = raw.city
  const region = raw.region ?? raw.state
  const postalCode = raw.postalCode
  const country = raw.country
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawCtCustomer): Customer {
  const defaultAddrRaw = raw.addresses?.find(
    (a) => a.id === (raw.defaultShippingAddressId ?? raw.defaultBillingAddressId),
  )
  const addresses = raw.addresses
    ?.map(mapAddress)
    .filter((a): a is Address => !!a)
  return {
    id: raw.id,
    email: raw.email,
    firstName: raw.firstName,
    lastName: raw.lastName,
    defaultAddress: mapAddress(defaultAddrRaw),
    addresses,
    createdAt: raw.createdAt,
    updatedAt: raw.lastModifiedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Customer → commercetools `CustomerDraft` body for
 * `POST /customers`. The platform requires `email` at minimum.
 */
export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  const addresses: RawCtAddress[] = []
  if (customer.defaultAddress) {
    addresses.push({
      streetName: customer.defaultAddress.line1 ?? undefined,
      additionalStreetInfo: customer.defaultAddress.line2 ?? undefined,
      city: customer.defaultAddress.city ?? undefined,
      region: customer.defaultAddress.region ?? undefined,
      postalCode: customer.defaultAddress.postalCode ?? undefined,
      country: customer.defaultAddress.country ?? undefined,
    })
  }
  return {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    addresses: addresses.length > 0 ? addresses : undefined,
  }
}

/**
 * Translate canonical partial Customer updates to commercetools customer
 * update actions.
 */
export function buildActionsForCustomer(
  _current: RawCtCustomer,
  updates: Partial<Customer>,
): Array<Record<string, unknown>> {
  const actions: Array<Record<string, unknown>> = []
  if (updates.email !== undefined) {
    actions.push({ action: 'changeEmail', email: updates.email })
  }
  if (updates.firstName !== undefined) {
    actions.push({ action: 'setFirstName', firstName: updates.firstName })
  }
  if (updates.lastName !== undefined) {
    actions.push({ action: 'setLastName', lastName: updates.lastName })
  }
  return actions
}
