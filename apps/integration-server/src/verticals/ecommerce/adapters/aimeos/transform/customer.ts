/**
 * Aimeos Customer → canonical Customer.
 *
 * Aimeos exposes customers via JSON:API at `GET /api/customer`. Attributes
 * use dot-notation keys:
 *
 *   customer.id          — numeric/string id
 *   customer.code        — login / username
 *   customer.label       — display name (full name)
 *   customer.email       — email address (also used as login)
 *   customer.salutation  — mr/ms/mrs/miss/company/''
 *   customer.company     — company name
 *   customer.vatno       — VAT number
 *   customer.title       — title (Dr., Prof., etc.)
 *   customer.firstname   — first name
 *   customer.lastname    — last name
 *   customer.address1    — street + house number
 *   customer.address2    — additional address line
 *   customer.address3    — c/o or floor
 *   customer.postal      — postal code
 *   customer.city        — city
 *   customer.state       — region/state
 *   customer.langid      — language code (e.g. "en")
 *   customer.countryid   — ISO country code
 *   customer.telephone   — phone number
 *   customer.telefax     — fax number
 *   customer.mobile      — mobile number
 *   customer.website     — website URL
 *   customer.status      — int: 0=disabled, 1=enabled
 *   customer.newsletter  — bool: opted in to newsletter
 *   customer.ctime       — ISO datetime created
 *   customer.mtime       — ISO datetime updated
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import type { AimeosResource } from '../client'

// ── Raw Aimeos shapes ─────────────────────────────────────────────────────────

export interface AimeosCustomerAttributes {
  'customer.id'?: string | number
  'customer.code'?: string
  'customer.label'?: string
  'customer.email'?: string | null
  'customer.salutation'?: string
  'customer.company'?: string | null
  'customer.title'?: string | null
  'customer.firstname'?: string | null
  'customer.lastname'?: string | null
  'customer.address1'?: string | null
  'customer.address2'?: string | null
  'customer.address3'?: string | null
  'customer.postal'?: string | null
  'customer.city'?: string | null
  'customer.state'?: string | null
  'customer.countryid'?: string | null
  'customer.langid'?: string | null
  'customer.telephone'?: string | null
  'customer.mobile'?: string | null
  'customer.website'?: string | null
  'customer.status'?: number
  'customer.newsletter'?: boolean | number
  'customer.ctime'?: string | null
  'customer.mtime'?: string | null
  [key: string]: unknown
}

export type AimeosCustomer = AimeosResource & {
  attributes: AimeosCustomerAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapDefaultAddress(attrs: AimeosCustomerAttributes): Address | undefined {
  const line1 = attrs['customer.address1'] ?? undefined
  const line2 = attrs['customer.address2'] ?? undefined
  const city = attrs['customer.city'] ?? undefined
  const region = attrs['customer.state'] ?? undefined
  const postalCode = attrs['customer.postal'] ?? undefined
  const country = attrs['customer.countryid'] ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function acceptsMarketing(newsletter: boolean | number | undefined): boolean | undefined {
  if (newsletter == null) return undefined
  if (typeof newsletter === 'boolean') return newsletter
  return newsletter !== 0
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: AimeosCustomer): Customer {
  const attrs = raw.attributes
  const defaultAddress = mapDefaultAddress(attrs)
  const phone =
    (attrs['customer.mobile'] as string | undefined) ??
    (attrs['customer.telephone'] as string | undefined) ??
    undefined

  return {
    id: raw.id,
    email: attrs['customer.email'] ?? undefined,
    firstName: attrs['customer.firstname'] ?? undefined,
    lastName: attrs['customer.lastname'] ?? undefined,
    phone,
    acceptsMarketing: acceptsMarketing(attrs['customer.newsletter'] as boolean | number | undefined),
    defaultAddress,
    addresses: defaultAddress ? [defaultAddress] : undefined,
    createdAt: attrs['customer.ctime'] ?? undefined,
    updatedAt: attrs['customer.mtime'] ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ────────────────────────────────────────

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (customer.email != null) attributes['customer.email'] = customer.email
  if (customer.firstName != null) attributes['customer.firstname'] = customer.firstName
  if (customer.lastName != null) attributes['customer.lastname'] = customer.lastName
  if (customer.phone != null) attributes['customer.telephone'] = customer.phone
  if (customer.acceptsMarketing != null) attributes['customer.newsletter'] = customer.acceptsMarketing
  if (customer.defaultAddress) {
    const addr = customer.defaultAddress
    if (addr.line1 != null) attributes['customer.address1'] = addr.line1
    if (addr.line2 != null) attributes['customer.address2'] = addr.line2
    if (addr.city != null) attributes['customer.city'] = addr.city
    if (addr.region != null) attributes['customer.state'] = addr.region
    if (addr.postalCode != null) attributes['customer.postal'] = addr.postalCode
    if (addr.country != null) attributes['customer.countryid'] = addr.country
  }

  return {
    data: {
      type: 'customer',
      attributes,
    },
  }
}
