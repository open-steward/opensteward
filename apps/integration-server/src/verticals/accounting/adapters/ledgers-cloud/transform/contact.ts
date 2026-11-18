/**
 * LEDGERS.Cloud contact transform.
 *
 * Endpoints:
 *   GET  /v3/list-contact        — paginated list
 *   GET  /v3/contact/{id}        — single contact
 *   POST /v3/add-contact         — create
 *   PUT  /v3/update-contact      — update
 *
 * Key wire fields (snake_case):
 *   id, contact_name, salutation, entity, business_name, display_name,
 *   email, mobile, phone, gstin, pan, currency, business_country,
 *   opening_payable (supplier flag), opening_receivable (customer flag),
 *   billing_address[], shipping_address[]
 *
 * LEDGERS contacts are unified — a contact can be both a customer and a
 * supplier. We infer customer/supplier from the opening_receivable /
 * opening_payable fields (if present) or default to customer.
 */

import type { Contact } from '../../../schema/contact'
import type { Address, Email, Telephone } from '../../../schema/shared'

interface LedgersAddress {
  address?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  pin_code?: string
  postal_code?: string
  country?: string
  [key: string]: unknown
}

export interface LedgersContact {
  id?: string | number
  contact_name?: string
  salutation?: string
  entity?: string
  business_name?: string
  display_name?: string
  email?: string
  mobile?: string
  phone?: string
  gstin?: string
  pan?: string
  currency?: string
  business_country?: string
  is_active?: boolean
  status?: string              // "active" | "inactive"
  opening_payable?: number     // non-zero implies supplier relationship
  opening_receivable?: number  // non-zero implies customer relationship
  contact_type?: string        // "customer" | "vendor" | "both"
  billing_address?: LedgersAddress[]
  shipping_address?: LedgersAddress[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(addr: LedgersAddress | undefined): Address | undefined {
  if (!addr) return undefined
  return {
    address1: addr.address || addr.line1 || undefined,
    address2: addr.line2 || undefined,
    city: addr.city || undefined,
    region: addr.state || undefined,
    postalCode: addr.pin_code || addr.postal_code || undefined,
    country: addr.country || undefined,
  }
}

export function transformContact(raw: LedgersContact): Contact {
  const emails: Email[] = raw.email
    ? [{ email: raw.email, type: 'WORK' }]
    : []
  const telephones: Telephone[] = []
  if (raw.mobile) telephones.push({ telephone: raw.mobile, type: 'MOBILE' })
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  const billingAddr = raw.billing_address?.[0]
  const shippingAddr = raw.shipping_address?.[0]

  // Determine customer / supplier flags
  const ctLower = (raw.contact_type ?? '').toLowerCase()
  let isCustomer = ctLower === 'customer' || ctLower === 'both'
  let isSupplier = ctLower === 'vendor' || ctLower === 'supplier' || ctLower === 'both'
  // Fall back to opening balance inference if type not set
  if (!isCustomer && !isSupplier) {
    if (raw.opening_receivable != null && raw.opening_receivable !== 0) isCustomer = true
    if (raw.opening_payable != null && raw.opening_payable !== 0) isSupplier = true
    // Default to customer if neither signal present
    if (!isCustomer && !isSupplier) isCustomer = true
  }

  const isActive =
    raw.is_active ?? (raw.status ? raw.status.toLowerCase() === 'active' : undefined)

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.display_name || raw.contact_name || raw.business_name || undefined,
    companyName: raw.business_name || undefined,
    taxNumber: raw.gstin || raw.pan || undefined,
    isCustomer,
    isSupplier,
    isActive,
    currency: raw.currency || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddress(billingAddr),
    shippingAddress: mapAddress(shippingAddr),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
