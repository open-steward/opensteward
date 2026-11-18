/**
 * Shopware B2B Suite Company → canonical Customer.
 *
 * The B2B Suite extension adds `b2b_company` entities that represent
 * business accounts. We map these to the canonical Customer type with
 * a lossy mapping (similar to OroCommerce's Customer→Company pattern):
 *
 *  - `company.name` → `firstName` (company name, no natural person split)
 *  - `company.email` → `email`
 *  - `company.customerNumber` → stored in metadata
 *  - B2B-specific fields (employees, budgets, roles) pass through in metadata
 *
 * For installations without B2B Suite, falls back to standard Shopware
 * customer entities with B2B metadata passthrough.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface RawShopwareAddress {
  id?: string
  firstName?: string
  lastName?: string
  street?: string
  additionalAddressLine1?: string | null
  zipcode?: string
  city?: string
  country?: { id?: string; iso?: string; name?: string } | null
  countryState?: { id?: string; shortCode?: string; name?: string } | null
  phoneNumber?: string | null
  [key: string]: unknown
}

/** B2B Company employee (metadata passthrough). */
export interface RawB2BEmployee {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  role?: { id?: string; name?: string } | null
  active?: boolean
  [key: string]: unknown
}

/** B2B Budget (metadata passthrough). */
export interface RawB2BBudget {
  id: string
  name?: string
  amount?: number
  currency?: string
  spent?: number
  active?: boolean
  [key: string]: unknown
}

/** B2B Role (metadata passthrough). */
export interface RawB2BRole {
  id: string
  name?: string
  permissions?: string[]
  [key: string]: unknown
}

/**
 * Raw Shopware B2B company / customer entity.
 * When the B2B Suite is active, customers may have b2b-specific
 * associations: `b2bCompany`, `b2bEmployees`, `b2bBudgets`, `b2bRoles`.
 */
export interface RawShopwareB2BCustomer {
  id: string
  customerNumber?: string
  email?: string
  firstName?: string
  lastName?: string
  company?: string | null
  active?: boolean
  guest?: boolean
  defaultBillingAddress?: RawShopwareAddress | null
  defaultShippingAddress?: RawShopwareAddress | null
  addresses?: RawShopwareAddress[]
  orderCount?: number
  // B2B-specific associations
  b2bCompany?: {
    id?: string
    name?: string
    status?: string
    customerNumber?: string
    [key: string]: unknown
  } | null
  b2bEmployees?: RawB2BEmployee[]
  b2bBudgets?: RawB2BBudget[]
  b2bRoles?: RawB2BRole[]
  createdAt?: string
  updatedAt?: string | null
  [key: string]: unknown
}

function mapAddress(raw: RawShopwareAddress | undefined | null): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.street
  const line2 = raw.additionalAddressLine1 ?? undefined
  const city = raw.city
  const region = raw.countryState?.name ?? raw.countryState?.shortCode
  const postalCode = raw.zipcode
  const country = raw.country?.iso ?? raw.country?.name
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawShopwareB2BCustomer): Customer {
  const allAddresses = (raw.addresses ?? [])
    .map(mapAddress)
    .filter((a): a is Address => a != null)
  const defaultAddr = mapAddress(raw.defaultBillingAddress) ?? allAddresses[0]
  const phone = raw.defaultBillingAddress?.phoneNumber ?? undefined

  // B2B lossy mapping: use company name as firstName when present,
  // similar to OroCommerce Customer→Company
  const companyName = raw.b2bCompany?.name ?? raw.company
  const firstName = companyName ?? raw.firstName
  const lastName = companyName ? undefined : raw.lastName

  return {
    id: raw.id,
    email: raw.email,
    firstName,
    lastName,
    phone,
    ordersCount: raw.orderCount,
    defaultAddress: defaultAddr,
    addresses: allAddresses.length > 0 ? allAddresses : undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    // B2B: set company field from firstName (lossy reverse)
    company: customer.firstName,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['defaultBillingAddress'] = {
      street: a.line1,
      additionalAddressLine1: a.line2,
      zipcode: a.postalCode,
      city: a.city,
      phoneNumber: customer.phone,
    }
  }
  return body
}
