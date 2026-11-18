/**
 * Znode Account → canonical Customer.
 *
 * **B2B lossiness**: Znode Account = company/organization (NOT a person).
 * AccountUser = individual person with login credentials. The canonical
 * Customer schema has person-level fields (firstName, lastName, email)
 * designed for B2C. We handle this as follows:
 *
 *  - `firstName` → company name (for display; the only name available)
 *  - `lastName` → undefined (no person-level last name at company level)
 *  - `email` → primary contact email if available from account users
 *  - `metadata.companyName` → full company name
 *  - `metadata.parentAccountId` → parent account id for hierarchy
 *  - `metadata.accountTypeId` → account type (B2B concept)
 *  - `metadata.accountUsers` → array of user summaries if available
 *  - `metadata.priceListId` → assigned price list id (B2B concept)
 *
 * This is a lossy B2B→B2C mapping similar to OroCommerce. Canonical
 * consumers expecting individual people will get companies instead.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawZnodeAccount {
  AccountId?: number
  AccountName?: string
  ExternalId?: string
  Email?: string
  PhoneNumber?: string
  LifetimeRevenue?: number
  CurrencyCode?: string
  ParentAccountId?: number | null
  AccountTypeId?: number | null
  PriceListId?: number | null
  Users?: Array<{
    UserId?: number
    Email?: string
    FirstName?: string
    LastName?: string
  }>
  CreatedDate?: string
  ModifiedDate?: string
  [key: string]: unknown
}

export function transformCustomer(raw: RawZnodeAccount): Customer {
  const accountUsers = raw.Users?.map((u) => ({
    id: u.UserId != null ? String(u.UserId) : undefined,
    email: u.Email,
    firstName: u.FirstName,
    lastName: u.LastName,
  }))

  // Use the first account user's email as the canonical email if
  // the account record itself doesn't have one.
  const email = raw.Email ?? accountUsers?.[0]?.email

  return {
    id: String(raw.AccountId ?? ''),
    email,
    firstName: raw.AccountName,
    lastName: undefined,
    phone: raw.PhoneNumber,
    totalSpent:
      raw.LifetimeRevenue != null
        ? {
            amount: majorToMinor(raw.LifetimeRevenue, raw.CurrencyCode ?? 'USD'),
            currency: raw.CurrencyCode ?? 'USD',
          }
        : undefined,
    createdAt: toIsoDatetime(raw.CreatedDate),
    updatedAt: toIsoDatetime(raw.ModifiedDate),
    metadata: {
      ...(raw as Record<string, unknown>),
      companyName: raw.AccountName,
      parentAccountId: raw.ParentAccountId != null ? String(raw.ParentAccountId) : undefined,
      accountTypeId: raw.AccountTypeId != null ? String(raw.AccountTypeId) : undefined,
      accountUsers,
      priceListId: raw.PriceListId != null ? String(raw.PriceListId) : undefined,
      b2bNote:
        'Znode Account is a company/organization, not a person. ' +
        'firstName contains the company name. Individual users are in metadata.accountUsers.',
    },
  }
}

export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  return {
    AccountName: customer.firstName ?? customer.lastName,
    Email: customer.email,
    PhoneNumber: customer.phone,
  }
}
