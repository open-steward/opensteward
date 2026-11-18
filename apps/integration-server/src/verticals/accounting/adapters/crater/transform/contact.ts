/**
 * Crater contact transforms.
 *
 * Crater exposes two counterparty types:
 *   - customers  GET /api/v1/customers
 *   - vendors    GET /api/v1/vendors
 *
 * Both share the same business object shape from the Businesses API.
 */
import type { Contact } from '../../../schema/contact'
import type { Address } from '../../../schema/shared'
import { toWorkEmail, nonempty } from '../../shared/transform'

// ── Crater wire type ──────────────────────────────────────────────────────────

export interface CraterAddress {
  name?: string
  street_1?: string
  street_2?: string
  city?: string
  state?: string
  zip?: string
  phone?: string
  [key: string]: unknown
}

export interface CraterContactBusiness {
  id: string
  name: string
  email?: string
  contact_first_name?: string
  contact_last_name?: string
  phone?: string
  website?: string
  is_customer?: boolean
  is_vendor?: boolean
  archived?: boolean
  billing_address?: CraterAddress
  shipping_address?: CraterAddress
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(addr?: CraterAddress): Address | undefined {
  if (!addr) return undefined
  const out: Address = {
    address1: addr.street_1 || undefined,
    address2: addr.street_2 || undefined,
    city: addr.city || undefined,
    region: addr.state || undefined,
    postalCode: addr.zip || undefined,
  }
  return Object.values(out).some(Boolean) ? out : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformContact(raw: CraterContactBusiness, role: 'customer' | 'vendor' = 'customer'): Contact {
  const emails = toWorkEmail(raw.email)

  return {
    id: raw.id,
    name: raw.name || undefined,
    firstName: raw.contact_first_name || undefined,
    lastName: raw.contact_last_name || undefined,
    isCustomer: role === 'customer' || raw.is_customer === true,
    isSupplier: role === 'vendor' || raw.is_vendor === true,
    isActive: raw.archived === false || raw.archived == null,
    emails: nonempty(emails),
    telephones: raw.phone
      ? [{ telephone: raw.phone, type: 'WORK' as const }]
      : undefined,
    billingAddress: mapAddress(raw.billing_address),
    shippingAddress: mapAddress(raw.shipping_address),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
