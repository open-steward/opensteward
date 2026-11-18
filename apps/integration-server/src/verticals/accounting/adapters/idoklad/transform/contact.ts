import type { Contact } from '../../../schema/contact'

export interface IdokladContact {
  Id: string | number
  CompanyName?: string
  TaxNumber?: string
  Email?: string
  Phone?: string
  Street?: string
  City?: string
  Country?: string
  PostalCode?: string
  [key: string]: unknown
}

export function transformContact(raw: IdokladContact): Contact {
  return {
    id: String(raw.Id),
    name: raw.CompanyName || undefined,
    emails: raw.Email ? [{ email: raw.Email, type: 'WORK' }] : undefined,
    telephones: raw.Phone ? [{ telephone: raw.Phone, type: 'WORK' }] : undefined,
    taxNumber: raw.TaxNumber || undefined,
    billingAddress: (raw.City || raw.Country || raw.Street) ? {
      address1: raw.Street || undefined,
      city: raw.City || undefined,
      postalCode: raw.PostalCode || undefined,
      country: raw.Country || undefined,
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
