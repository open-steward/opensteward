/**
 * Tipalti payee → canonical Contact transform.
 *
 * In Tipalti, the primary entity is the "payee" (vendor / supplier).
 * REST endpoint: GET /v1/payees
 *
 * All Tipalti payees are modelled as suppliers (isSupplier=true).
 * Tipalti does not have a buyer/customer concept in its accounting vertical.
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

// ── Wire types ────────────────────────────────────────────────────────────────

export interface TipaltiPayeeAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface TipaltiPayeeContact {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}

export interface TipaltiPayee {
  id: string
  name?: string
  /** 'ACTIVE' | 'BLOCKED' | 'SUSPENDED' */
  status?: string
  type?: string
  companyName?: string
  taxId?: string
  contact?: TipaltiPayeeContact
  address?: TipaltiPayeeAddress
  currency?: string
  paymentMethod?: string
  portalUrl?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(a: TipaltiPayeeAddress | undefined): Address | undefined {
  if (!a) return undefined
  return {
    address1: a.line1 || undefined,
    address2: a.line2 || undefined,
    city: a.city || undefined,
    region: a.state || undefined,
    postalCode: a.zip || undefined,
    country: a.country || undefined,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformPayee(raw: TipaltiPayee): Contact {
  const emails: Email[] = raw.contact?.email
    ? [{ email: raw.contact.email, type: 'WORK' }]
    : []
  const telephones: Telephone[] = raw.contact?.phone
    ? [{ telephone: raw.contact.phone, type: 'WORK' }]
    : []

  return {
    id: raw.id,
    name: raw.name || raw.companyName || undefined,
    firstName: raw.contact?.firstName || undefined,
    lastName: raw.contact?.lastName || undefined,
    companyName: raw.companyName || undefined,
    taxNumber: raw.taxId || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.status === 'ACTIVE',
    currency: raw.currency || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddress(raw.address),
    portalUrl: raw.portalUrl || undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
