/**
 * MRI Software — Contact transform.
 *
 * MRI exposes Customers (tenants / AR contacts) and Suppliers (vendors / AP contacts)
 * as distinct resource collections.  Both map to the canonical Contact type.
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

// ── Shared address shape ─────────────────────────────────────────────────────

interface MriAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

function mapAddress(addr?: MriAddress): Address | undefined {
  if (!addr) return undefined
  return {
    address1: addr.line1 || undefined,
    address2: addr.line2 || undefined,
    city: addr.city || undefined,
    region: addr.state || undefined,
    postalCode: addr.postalCode || undefined,
    country: addr.country || undefined,
  }
}

// ── Customer (AR) ────────────────────────────────────────────────────────────

export interface MriCustomer {
  id: string
  name?: string
  firstName?: string
  lastName?: string
  companyName?: string
  email?: string
  phone?: string
  currencyCode?: string
  isActive?: boolean
  taxNumber?: string
  billingAddress?: MriAddress
  shippingAddress?: MriAddress
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCustomer(raw: MriCustomer): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []
  const telephones: Telephone[] = raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : []

  return {
    id: `cust_${raw.id}`,
    name: raw.name || undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    companyName: raw.companyName || undefined,
    taxNumber: raw.taxNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.isActive ?? true,
    currency: raw.currencyCode || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Supplier / Vendor (AP) ───────────────────────────────────────────────────

export interface MriSupplier {
  id: string
  name?: string
  firstName?: string
  lastName?: string
  companyName?: string
  email?: string
  phone?: string
  currencyCode?: string
  isActive?: boolean
  taxNumber?: string
  address?: MriAddress
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformSupplier(raw: MriSupplier): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []
  const telephones: Telephone[] = raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : []

  return {
    id: `vend_${raw.id}`,
    name: raw.name || undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    companyName: raw.companyName || undefined,
    taxNumber: raw.taxNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.isActive ?? true,
    currency: raw.currencyCode || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddress(raw.address),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
