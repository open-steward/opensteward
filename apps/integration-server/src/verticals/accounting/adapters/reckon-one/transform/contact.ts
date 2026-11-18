/**
 * Reckon One v2 contact transforms.
 *
 * Reckon One has two contact types:
 *   - customers: GET /R1/{cashbookId}/customers[/{customerId}]
 *   - suppliers: GET /R1/{cashbookId}/suppliers[/{supplierId}]
 *
 * Both share a similar shape; we prefix the canonical id to distinguish.
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

interface ReckonOneAddress {
  street?: string
  city?: string
  state?: string
  postCode?: string
  country?: string
}

export interface ReckonOneCustomer {
  id: string
  name?: string
  firstName?: string
  lastName?: string
  companyName?: string
  isActive?: boolean
  emailAddress?: string
  phoneNumber?: string
  mobile?: string
  billingAddress?: ReckonOneAddress
  shippingAddress?: ReckonOneAddress
  currency?: string
  taxNumber?: string
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

export interface ReckonOneSupplier {
  id: string
  name?: string
  firstName?: string
  lastName?: string
  companyName?: string
  isActive?: boolean
  emailAddress?: string
  phoneNumber?: string
  mobile?: string
  billingAddress?: ReckonOneAddress
  currency?: string
  taxNumber?: string
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

function mapAddr(addr: ReckonOneAddress | undefined): Address | undefined {
  if (!addr) return undefined
  return {
    address1: addr.street || undefined,
    city: addr.city || undefined,
    region: addr.state || undefined,
    postalCode: addr.postCode || undefined,
    country: addr.country || undefined,
  }
}

function pickPhone(phone?: string, mobile?: string): Telephone[] {
  const out: Telephone[] = []
  if (phone) out.push({ telephone: phone, type: 'WORK' })
  if (mobile) out.push({ telephone: mobile, type: 'MOBILE' })
  return out
}

export function transformCustomer(raw: ReckonOneCustomer): Contact {
  const emails: Email[] = raw.emailAddress ? [{ email: raw.emailAddress, type: 'WORK' }] : []
  const telephones = pickPhone(raw.phoneNumber, raw.mobile)

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
    currency: raw.currency || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddr(raw.billingAddress),
    shippingAddress: mapAddr(raw.shippingAddress),
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: ReckonOneSupplier): Contact {
  const emails: Email[] = raw.emailAddress ? [{ email: raw.emailAddress, type: 'WORK' }] : []
  const telephones = pickPhone(raw.phoneNumber, raw.mobile)

  return {
    id: `supp_${raw.id}`,
    name: raw.name || undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    companyName: raw.companyName || undefined,
    taxNumber: raw.taxNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.isActive ?? true,
    currency: raw.currency || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddr(raw.billingAddress),
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
