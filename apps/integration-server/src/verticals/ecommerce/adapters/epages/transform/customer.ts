/**
 * ePages Beyond Customer ↔ canonical Customer.
 *
 * Confirmed fields (https://api-docs.beyondshop.cloud/ng-customer-customer-public-api.html):
 * `_id`, `email`, `customerNumber`, `defaultShippingAddress`,
 * `defaultBillingAddress`, `creationDate`, `customerComment`; nested address
 * objects carry `firstName`, `middleName`, `lastName`, `street`,
 * `houseNumber`, `street2`, `postalCode`, `city`, `country`, `state`,
 * `email`, `phone`. Create/update accept `firstName`, `lastName`, `email`,
 * `initialPassword` (create only), `billingAddress`, `shippingAddress`.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawEpagesAddress {
  firstName?: string
  lastName?: string
  street?: string
  houseNumber?: string
  street2?: string
  postalCode?: string
  city?: string
  country?: string
  state?: string
  email?: string
  phone?: string
  [key: string]: unknown
}

export interface RawEpagesCustomer {
  _id: string
  email?: string
  customerNumber?: string
  defaultShippingAddress?: RawEpagesAddress
  defaultBillingAddress?: RawEpagesAddress
  creationDate?: string
  customerComment?: string
  [key: string]: unknown
}

function mapAddress(raw: RawEpagesAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = [raw.street, raw.houseNumber].filter(Boolean).join(' ') || undefined
  return {
    line1,
    line2: raw.street2,
    city: raw.city,
    region: raw.state,
    postalCode: raw.postalCode,
    country: raw.country,
  }
}

export function transformCustomer(raw: RawEpagesCustomer): Customer {
  const billing = mapAddress(raw.defaultBillingAddress)
  const shipping = mapAddress(raw.defaultShippingAddress)
  const addresses = [billing, shipping].filter((a): a is Address => a !== undefined)
  return {
    id: raw._id,
    email: raw.email,
    firstName: raw.defaultBillingAddress?.firstName ?? raw.defaultShippingAddress?.firstName,
    lastName: raw.defaultBillingAddress?.lastName ?? raw.defaultShippingAddress?.lastName,
    phone: raw.defaultBillingAddress?.phone ?? raw.defaultShippingAddress?.phone,
    defaultAddress: billing ?? shipping,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.creationDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Body for `POST /api/customers` / `PUT /api/customers/{id}`. */
export function untransformCustomer(data: Partial<Customer>): Record<string, unknown> {
  if (!data.email) {
    throw new Error('ePages Beyond createCustomer/updateCustomer requires `email`.')
  }
  const body: Record<string, unknown> = {
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
  }
  const addr = data.defaultAddress
  if (addr) {
    // Beyond splits `street` and `houseNumber` into separate fields; the
    // canonical `Address.line1` is one free-text string with no reliable
    // split point, so the whole line goes into `street` rather than
    // guessing where the house number starts.
    body.billingAddress = {
      firstName: data.firstName,
      lastName: data.lastName,
      street: addr.line1,
      street2: addr.line2,
      postalCode: addr.postalCode,
      city: addr.city,
      state: addr.region,
      country: addr.country,
    }
  }
  return body
}
