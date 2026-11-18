import type { Contact } from '../../../schema/contact'

export interface EBoekhoudenContact {
  id?: number | string
  companyName?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  mobile?: string
  isDebtor?: boolean
  isCreditor?: boolean
  isActive?: boolean
  vatNumber?: string
  cocNumber?: string
  address?: string
  zipCode?: string
  city?: string
  country?: string
  currency?: string
  [key: string]: unknown
}

export function transformContact(raw: EBoekhoudenContact): Contact {
  const emails = raw.email ? [{ email: raw.email }] : undefined
  const telephones =
    raw.phone || raw.mobile
      ? [
          ...(raw.phone ? [{ telephone: raw.phone, type: 'WORK' as const }] : []),
          ...(raw.mobile ? [{ telephone: raw.mobile, type: 'MOBILE' as const }] : []),
        ]
      : undefined

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    companyName: raw.companyName || undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: raw.isDebtor ?? undefined,
    isSupplier: raw.isCreditor ?? undefined,
    isActive: raw.isActive ?? true,
    currency: raw.currency || undefined,
    emails,
    telephones,
    billingAddress:
      raw.address || raw.city
        ? {
            address1: raw.address || undefined,
            city: raw.city || undefined,
            postalCode: raw.zipCode || undefined,
            country: raw.country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
