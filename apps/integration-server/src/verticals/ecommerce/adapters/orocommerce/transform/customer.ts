/**
 * OroCommerce Customer → canonical Customer.
 *
 * **B2B lossiness**: OroCommerce Customer = company/account (NOT a person).
 * CustomerUser = person with login credentials. The canonical Customer
 * schema has person-level fields (firstName, lastName, email) which are
 * designed for B2C. We handle this as follows:
 *
 *  - `firstName` → company name (for display; the only name available)
 *  - `lastName` → undefined (no person-level last name at company level)
 *  - `email` → primary contact email if available from owner CustomerUser
 *  - `metadata.companyName` → full company name
 *  - `metadata.parentCustomerId` → parent account id for hierarchy
 *  - `metadata.customerGroupId` → customer group (B2B concept)
 *  - `metadata.customerUsers` → array of user summaries if available
 *  - `metadata.priceListId` → assigned price list id (B2B concept)
 *
 * This is the most lossy B2B→B2C mapping in the adapter. Canonical
 * consumers expecting individual people will get companies instead.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawOroCustomer {
  id: string
  name?: string
  lifetime?: number
  email?: string // from owner/primary contact
  phone?: string
  parent?: { id: string } | null
  group?: { id: string } | null
  owner?: { id: string } | null
  users?: Array<{ id: string; email?: string; firstName?: string; lastName?: string }>
  priceList?: { id: string } | null
  createdAt?: string
  updatedAt?: string
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

export function transformCustomer(raw: RawOroCustomer): Customer {
  const customerUsers = raw.users?.map((u) => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
  }))

  // Use the first CustomerUser's email as the canonical email if
  // the Customer record itself doesn't have one.
  const email = raw.email ?? customerUsers?.[0]?.email

  return {
    id: raw.id,
    email,
    firstName: raw.name,
    lastName: undefined,
    phone: raw.phone,
    totalSpent:
      raw.lifetime != null
        ? { amount: majorToMinor(raw.lifetime, 'USD'), currency: 'USD' }
        : undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: {
      ...(raw as Record<string, unknown>),
      companyName: raw.name,
      parentCustomerId: raw.parent?.id ?? undefined,
      customerGroupId: raw.group?.id ?? undefined,
      customerUsers,
      priceListId: raw.priceList?.id ?? undefined,
      b2bNote:
        'OroCommerce Customer is a company/account, not a person. ' +
        'firstName contains the company name. Individual users are in metadata.customerUsers.',
    },
  }
}

export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  return {
    data: {
      type: 'customers',
      attributes: {
        name: customer.firstName ?? customer.lastName,
      },
    },
  }
}
