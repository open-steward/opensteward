/**
 * Shopgate Customer → canonical Customer.
 *
 * Shopgate's Customer Service returns customer objects identified by a `id`
 * string. Contact details (addresses) are nested under `contacts[]`.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

// ── Raw Shopgate shapes ───────────────────────────────────────────────────────

export interface RawShopgateContact {
  firstName?: string | null
  lastName?: string | null
  emailAddress?: string | null
  phone?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  countryCode?: string | null
  isPrimary?: boolean
  [key: string]: unknown
}

export interface RawShopgateCustomer {
  id: string
  externalCustomerNumber?: string | null
  firstName?: string | null
  lastName?: string | null
  emailAddress?: string | null
  phone?: string | null
  hasAccount?: boolean
  isAnonymous?: boolean
  contacts?: RawShopgateContact[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(c: RawShopgateContact): Address | undefined {
  const line1 = c.street1 ?? undefined
  const city = c.city ?? undefined
  const country = c.countryCode ?? c.country ?? undefined
  const postalCode = c.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: c.street2 ?? undefined,
    city,
    region: c.state ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawShopgateCustomer): Customer {
  const primaryContact = raw.contacts?.find((c) => c.isPrimary) ?? raw.contacts?.[0]
  const otherContacts = raw.contacts?.filter((c) => c !== primaryContact) ?? []

  return {
    id: raw.id,
    email: raw.emailAddress ?? primaryContact?.emailAddress ?? undefined,
    firstName: raw.firstName ?? primaryContact?.firstName ?? undefined,
    lastName: raw.lastName ?? primaryContact?.lastName ?? undefined,
    phone: raw.phone ?? primaryContact?.phone ?? undefined,
    defaultAddress: primaryContact ? mapAddress(primaryContact) : undefined,
    addresses: otherContacts.map(mapAddress).filter((a): a is Address => !!a),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Shopgate customer body (create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: customer.firstName,
    lastName: customer.lastName,
    emailAddress: customer.email,
    phone: customer.phone,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.contacts = [
      {
        firstName: customer.firstName,
        lastName: customer.lastName,
        emailAddress: customer.email,
        phone: customer.phone,
        street1: a.line1,
        street2: a.line2,
        city: a.city,
        state: a.region,
        zip: a.postalCode,
        countryCode: a.country,
        isPrimary: true,
      },
    ]
  }
  return body
}
