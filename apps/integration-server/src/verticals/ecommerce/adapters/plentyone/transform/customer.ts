/**
 * PlentyONE Contact → canonical Customer.
 *
 * PlentyONE calls customers "contacts" (stored under accounts/contacts).
 * Contact options (phone, email) are stored in a nested `options` array
 * keyed by typeId. Address data lives under separate address endpoints.
 *
 * Endpoints used:
 *   GET /rest/accounts/contacts
 *   GET /rest/accounts/contacts/{contactId}
 *   POST /rest/accounts/contacts
 *   PUT /rest/accounts/contacts/{contactId}
 *   DELETE /rest/accounts/contacts/{contactId}
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

/**
 * PlentyONE contact option typeId values (subset relevant to us):
 *   1 = email, 2 = phone (private), 3 = phone (mobile), 4 = fax
 */
export interface RawPlentyOneContactOption {
  typeId?: number
  subTypeId?: number
  value?: string | null
  priority?: number
  [key: string]: unknown
}

export interface RawPlentyOneContactAddress {
  id?: number | string
  name1?: string | null
  name2?: string | null
  name3?: string | null
  address1?: string | null
  address2?: string | null
  postalCode?: string | null
  town?: string | null
  countryId?: number
  stateId?: number
  countryIsoCode2?: string | null
  options?: Array<{ typeId?: number; value?: string | null }>
  [key: string]: unknown
}

export interface RawPlentyOneContact {
  id: number | string
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  email?: string | null
  gender?: string | null
  typeId?: number
  classId?: number
  birthdayAt?: string | null
  options?: RawPlentyOneContactOption[]
  addresses?: RawPlentyOneContactAddress[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the primary value for a given option typeId from the options array. */
function pickOption(
  options: RawPlentyOneContactOption[] | undefined,
  typeId: number,
): string | undefined {
  if (!options) return undefined
  const sorted = options
    .filter((o) => o.typeId === typeId && o.value)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  return sorted[0]?.value ?? undefined
}

function mapAddress(raw: RawPlentyOneContactAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.town ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryIsoCode2 ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    postalCode,
    country,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformContact(raw: RawPlentyOneContact): Customer {
  // Email may live at the top level or in options (typeId 1)
  const email = raw.email ?? pickOption(raw.options, 1) ?? undefined
  // Phone: private phone is typeId 2, mobile is typeId 3
  const phone = pickOption(raw.options, 2) ?? pickOption(raw.options, 3) ?? undefined
  const addresses = (raw.addresses ?? [])
    .map(mapAddress)
    .filter((a): a is Address => !!a)

  return {
    id: String(raw.id),
    email: email ?? undefined,
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: phone ?? undefined,
    defaultAddress: addresses[0],
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → PlentyONE contact body for create/update. */
export function untransformContact(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    typeId: 1, // 1 = customer
  }
  const options: RawPlentyOneContactOption[] = []
  if (customer.email) {
    options.push({ typeId: 1, subTypeId: 4, value: customer.email, priority: 0 })
  }
  if (customer.phone) {
    options.push({ typeId: 2, subTypeId: 4, value: customer.phone, priority: 0 })
  }
  if (options.length > 0) body['options'] = options
  return body
}
