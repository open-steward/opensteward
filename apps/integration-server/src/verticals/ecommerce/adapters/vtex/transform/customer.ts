/**
 * VTEX Master Data v2 customer (CL entity) → canonical Customer.
 *
 * VTEX stores shopper profiles in the Master Data v2 `CL` (Customers) entity.
 * Profiles are queried via `GET /api/dataentities/CL/search` using the
 * `REST-Range` header for pagination. The `_fields` query param controls
 * which fields are returned; the adapter requests the full set of common
 * CL fields.
 *
 * Notable differences from WooCommerce:
 *  - Addresses are not nested on the customer record in CL; they live in the
 *    AD (Addresses) entity. We expose defaultAddress only when the
 *    `homeCity`, `homeState` etc. fields are present.
 *  - `totalOrders` is stored as an integer field on CL.
 *
 * Docs:
 *   https://developers.vtex.com/docs/guides/master-data-api
 *   https://developers.vtex.com/docs/api-reference/master-data-api-v2
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw VTEX CL entity shape ─────────────────────────────────────────────────

export interface RawVtexCustomer {
  id: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  homePhone?: string | null
  document?: string | null
  documentType?: string | null
  isCorporate?: boolean
  corporateName?: string | null
  corporateDocument?: string | null
  stateInscription?: string | null
  birthDate?: string | null
  gender?: string | null
  pii?: boolean
  isNewsletterOptIn?: boolean
  /** Number of completed orders for this customer. */
  totalOrders?: number | null
  createdIn?: string | null
  updatedIn?: string | null
  /** Flat address fields sometimes present on CL records. */
  homeCity?: string | null
  homeState?: string | null
  homeCountry?: string | null
  homeNumber?: string | null
  homeStreet?: string | null
  homeComplement?: string | null
  homeNeighborhood?: string | null
  homePostalCode?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildAddress(raw: RawVtexCustomer): Address | undefined {
  const streetParts = [raw.homeStreet, raw.homeNumber].filter(Boolean)
  const line1 = streetParts.length > 0 ? streetParts.join(', ') : undefined
  const line2 = raw.homeComplement ?? undefined
  const city = raw.homeCity ?? undefined
  const region = raw.homeState ?? undefined
  const postalCode = raw.homePostalCode ?? undefined
  const country = raw.homeCountry ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawVtexCustomer): Customer {
  const defaultAddress = buildAddress(raw)

  return {
    id: raw.id,
    email: raw.email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: raw.phone ?? raw.homePhone ?? undefined,
    ordersCount: raw.totalOrders ?? undefined,
    defaultAddress,
    addresses: defaultAddress ? [defaultAddress] : undefined,
    createdAt: toIsoDatetime(raw.createdIn ?? undefined) ?? undefined,
    updatedAt: toIsoDatetime(raw.updatedIn ?? undefined) ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    const streetParts = [a.line1].filter(Boolean)
    body['homeStreet'] = streetParts[0] ?? undefined
    body['homeComplement'] = a.line2
    body['homeCity'] = a.city
    body['homeState'] = a.region
    body['homePostalCode'] = a.postalCode
    body['homeCountry'] = a.country
  }
  return body
}
