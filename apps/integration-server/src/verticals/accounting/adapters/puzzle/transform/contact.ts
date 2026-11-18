import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

// ── Puzzle wire types ─────────────────────────────────────────────────────────

export interface PuzzleBillingAddress {
  street?: string
  street2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  [key: string]: unknown
}

export interface PuzzleCustomer {
  id: string
  name?: string
  email?: string
  phoneNumber?: string
  companyName?: string
  contactName?: string
  description?: string
  website?: string
  status?: string    // Active | Inactive | Unknown
  type?: string      // Individual | Business | Unknown
  billingAddressJson?: PuzzleBillingAddress
  [key: string]: unknown
}

export interface PuzzleVendor {
  id: string
  name: string
  permaName?: string
  description?: string
  is1099Vendor?: boolean
  status?: string    // Active | Inactive | Unknown
  type?: string      // Individual | Business | Unknown
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapBillingAddr(addr: PuzzleBillingAddress | undefined): Address | undefined {
  if (!addr) return undefined
  return {
    address1: addr.street || undefined,
    address2: addr.street2 || undefined,
    city: addr.city || undefined,
    region: addr.state || undefined,
    postalCode: addr.zip || undefined,
    country: addr.country || undefined,
  }
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: PuzzleCustomer): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []
  const telephones: Telephone[] = raw.phoneNumber
    ? [{ telephone: raw.phoneNumber, type: 'WORK' }]
    : []

  return {
    id: raw.id,
    name: raw.name || raw.companyName || raw.contactName || undefined,
    companyName: raw.companyName || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.status === 'Active' ? true : raw.status === 'Inactive' ? false : undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapBillingAddr(raw.billingAddressJson),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformVendor(raw: PuzzleVendor): Contact {
  return {
    id: raw.id,
    name: raw.name || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.status === 'Active' ? true : raw.status === 'Inactive' ? false : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
