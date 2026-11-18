import type { Contact } from '../../../schema/contact'

export interface ExactContact {
  ID?: string
  Name?: string
  Email?: string
  Phone?: string
  IsCustomer?: boolean
  IsSupplier?: boolean
  IsActive?: boolean
  VATNumber?: string
  AddressLine1?: string
  AddressLine2?: string
  City?: string
  State?: string
  Postcode?: string
  Country?: string
  Currency?: string
  [key: string]: unknown
}

export function transformContact(raw: ExactContact): Contact {
  return {
    id: raw.ID || undefined,
    name: raw.Name || undefined,
    taxNumber: raw.VATNumber || undefined,
    isCustomer: raw.IsCustomer ?? undefined,
    isSupplier: raw.IsSupplier ?? undefined,
    isActive: raw.IsActive ?? true,
    currency: raw.Currency || undefined,
    emails: raw.Email ? [{ email: raw.Email }] : undefined,
    telephones: raw.Phone ? [{ telephone: raw.Phone }] : undefined,
    billingAddress:
      raw.AddressLine1 || raw.City
        ? {
            address1: raw.AddressLine1 || undefined,
            address2: raw.AddressLine2 || undefined,
            city: raw.City || undefined,
            region: raw.State || undefined,
            postalCode: raw.Postcode || undefined,
            country: raw.Country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
