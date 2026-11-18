import type { Contact } from '../../../schema/contact'

export interface SuperfakturaContact {
  id: string | number
  name?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  zip?: string
  ico?: string
  [key: string]: unknown
}

export function transformContact(raw: SuperfakturaContact): Contact {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    taxNumber: raw.ico || undefined,
    billingAddress: (raw.city || raw.country || raw.address) ? {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip || undefined,
      country: raw.country || undefined,
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
