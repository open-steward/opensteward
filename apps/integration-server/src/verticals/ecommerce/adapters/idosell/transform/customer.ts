/**
 * IdoSell Client → canonical Customer.
 *
 * Shape verified against the OpenAPI fragment embedded in
 * https://idosell.readme.io/reference/clientsclientsget — name/phone/address
 * live under `clientBillingAddress`, not on the client record directly.
 *
 * Write endpoints are inconsistent between themselves (a genuine platform
 * quirk, not a summarisation error — verified against the raw OpenAPI JSON
 * on both pages):
 *   - `POST /clients/clients` (clientsclientspost) accepts snake_case /
 *     lowercase fields (`login`, `email`, `firstname`, `lastname`, `phone`, …).
 *   - `PUT /clients/clients` (clientsclientsput) accepts `clientXxx`
 *     camelCase fields and — notably — has NO `clientId` property; the
 *     customer being updated is identified by `clientLogin`.
 *   - `DELETE /clients/remove?clientId=…` (clientsremovedelete-1) is the odd
 *     one out again: a query-string `clientId`.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawIdosellBillingAddress {
  clientFirstName?: string
  clientLastName?: string
  clientStreet?: string
  clientZipCode?: string
  clientCity?: string
  clientCountryId?: string
  clientPhone1?: string
  clientPhone2?: string
}

export interface RawIdosellClient {
  clientId: number | string
  clientLogin?: string
  clientEmail?: string
  clientCodeExternal?: string
  clientRegistrationDate?: string
  clientsLastModificationDate?: string
  clientBillingAddress?: RawIdosellBillingAddress
}

function mapAddress(raw: RawIdosellBillingAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const country = raw.clientCountryId?.toUpperCase()
  const line1 = raw.clientStreet ?? undefined
  const city = raw.clientCity ?? undefined
  const postalCode = raw.clientZipCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, region: undefined, postalCode, country }
}

export function transformClient(raw: RawIdosellClient): Customer {
  const addr = raw.clientBillingAddress
  return {
    id: String(raw.clientId),
    email: raw.clientEmail || undefined,
    firstName: addr?.clientFirstName || undefined,
    lastName: addr?.clientLastName || undefined,
    phone: addr?.clientPhone1 || addr?.clientPhone2 || undefined,
    defaultAddress: mapAddress(addr),
    createdAt: toIsoDatetime(raw.clientRegistrationDate),
    updatedAt: toIsoDatetime(raw.clientsLastModificationDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → `POST /clients/clients` body fields (create). */
export function untransformClientForCreate(customer: Partial<Customer>): Record<string, unknown> {
  return {
    email: customer.email,
    firstname: customer.firstName,
    lastname: customer.lastName,
    phone: customer.phone,
    street: customer.defaultAddress?.line1,
    zipcode: customer.defaultAddress?.postalCode,
    city: customer.defaultAddress?.city,
    country_code: customer.defaultAddress?.country?.toLowerCase(),
  }
}

/**
 * Canonical Customer → `PUT /clients/clients` body fields (update). The
 * caller supplies `clientLogin` — the only accepted identifier — since it
 * is not a canonical Customer field.
 */
export function untransformClientForUpdate(
  customer: Partial<Customer>,
  clientLogin: string,
): Record<string, unknown> {
  return {
    clientLogin,
    clientEmail: customer.email,
    clientFirstName: customer.firstName,
    clientLastName: customer.lastName,
    clientPhone1: customer.phone,
    clientStreet: customer.defaultAddress?.line1,
    clientZipCode: customer.defaultAddress?.postalCode,
    clientCity: customer.defaultAddress?.city,
    clientCountryId: customer.defaultAddress?.country?.toLowerCase(),
  }
}
