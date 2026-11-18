import type { Contact } from '../../../schema/contact'

export interface NetSuiteCustomer {
  id?: string | number
  companyName?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  isPerson?: boolean
  isInactive?: boolean
  vatRegNumber?: string
  currency?: string
  addr1?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  [key: string]: unknown
}

export function transformContact(raw: NetSuiteCustomer): Contact {
  const name = raw.companyName || (raw.firstName || raw.lastName ? `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim() : undefined)
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name,
    companyName: raw.companyName || undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    taxNumber: raw.vatRegNumber || undefined,
    isCustomer: true,
    isActive: raw.isInactive !== true,
    currency: raw.currency || undefined,
    emails: raw.email ? [{ email: raw.email }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone }] : undefined,
    billingAddress:
      raw.addr1 || raw.city
        ? {
            address1: raw.addr1 || undefined,
            city: raw.city || undefined,
            region: raw.state || undefined,
            postalCode: raw.zip || undefined,
            country: raw.country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
