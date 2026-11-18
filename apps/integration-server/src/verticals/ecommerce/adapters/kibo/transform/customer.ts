/**
 * Kibo Commerce Customer Account → canonical Customer.
 *
 * Kibo customer accounts live at:
 *   GET /api/commerce/customer/accounts
 *   GET /api/commerce/customer/accounts/{accountId}
 *
 * Key fields:
 *   - `id`                   → id (integer, stringified)
 *   - `emailAddress`         → email
 *   - `firstName`            → firstName
 *   - `lastName`             → lastName
 *   - `contacts[]`           → addresses (first contact with isPrimary is defaultAddress)
 *   - `orderCount`           → ordersCount
 *   - `lifetimeValueExclTax` / `lifetimeValue` → totalSpent
 *   - `acceptsMarketing`     → acceptsMarketing
 *   - `auditInfo.createDate` → createdAt
 *   - `auditInfo.updateDate` → updatedAt
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Kibo shapes ───────────────────────────────────────────────────────────

export interface RawKiboContactAddress {
  address1?: string
  address2?: string
  cityOrTown?: string
  stateOrProvince?: string
  postalOrZipCode?: string
  countryCode?: string
  [key: string]: unknown
}

export interface RawKiboContact {
  id?: number
  firstName?: string
  lastNameOrSurname?: string
  emailAddress?: string
  phoneNumbers?: {
    home?: string
    mobile?: string
    work?: string
    [key: string]: unknown
  }
  address?: RawKiboContactAddress
  isPrimary?: boolean
  [key: string]: unknown
}

export interface RawKiboAuditInfo {
  createDate?: string
  updateDate?: string
  [key: string]: unknown
}

export interface RawKiboCustomer {
  id?: number
  emailAddress?: string
  userName?: string
  firstName?: string
  lastName?: string
  acceptsMarketing?: boolean
  isActive?: boolean
  isAnonymous?: boolean
  orderCount?: number
  lifetimeValue?: number
  lifetimeValueExclTax?: number
  currencyCode?: string
  contacts?: RawKiboContact[]
  auditInfo?: RawKiboAuditInfo
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(contact: RawKiboContact | undefined): Address | undefined {
  if (!contact?.address) return undefined
  const addr = contact.address
  const line1 = addr.address1
  const line2 = addr.address2
  const city = addr.cityOrTown
  const region = addr.stateOrProvince
  const postalCode = addr.postalOrZipCode
  const country = addr.countryCode
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapAddresses(contacts: RawKiboContact[] | undefined): Address[] | undefined {
  if (!contacts || contacts.length === 0) return undefined
  const addrs = contacts.map(mapAddress).filter((a): a is Address => a !== undefined)
  return addrs.length > 0 ? addrs : undefined
}

function findDefaultContact(contacts: RawKiboContact[] | undefined): RawKiboContact | undefined {
  if (!contacts || contacts.length === 0) return undefined
  return contacts.find((c) => c.isPrimary) ?? contacts[0]
}

function extractPhone(contact: RawKiboContact | undefined): string | undefined {
  if (!contact) return undefined
  return (
    contact.phoneNumbers?.mobile ??
    contact.phoneNumbers?.home ??
    contact.phoneNumbers?.work
  )
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawKiboCustomer): Customer {
  const defaultContact = findDefaultContact(raw.contacts)
  const currency = raw.currencyCode ?? 'USD'
  const spent = raw.lifetimeValueExclTax ?? raw.lifetimeValue

  return {
    id: String(raw.id ?? ''),
    email: raw.emailAddress,
    firstName: raw.firstName ?? defaultContact?.firstName,
    lastName: raw.lastName ?? defaultContact?.lastNameOrSurname,
    phone: extractPhone(defaultContact),
    acceptsMarketing: raw.acceptsMarketing,
    ordersCount: raw.orderCount,
    totalSpent: spent != null ? { amount: majorToMinor(spent, currency), currency } : undefined,
    defaultAddress: mapAddress(defaultContact),
    addresses: mapAddresses(raw.contacts),
    createdAt: raw.auditInfo?.createDate,
    updatedAt: raw.auditInfo?.updateDate,
    metadata: raw as Record<string, unknown>,
  }
}
