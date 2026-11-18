import type { Contact } from '../../../schema/contact'

export interface MyobContactAddress {
  Street?: string
  City?: string
  State?: string
  PostCode?: string
  Country?: string
  Phone1?: string
  Phone2?: string
  Email?: string
  [key: string]: unknown
}

export interface MyobContact {
  UID?: string
  DisplayID?: string
  CompanyName?: string
  FirstName?: string
  LastName?: string
  IsIndividual?: boolean
  IsActive?: boolean
  CurrentBalance?: number
  TaxNumber?: string
  Addresses?: MyobContactAddress[]
  [key: string]: unknown
}

export function transformContact(raw: MyobContact): Contact {
  const primaryAddr = raw.Addresses?.[0]
  return {
    id: raw.UID || undefined,
    name: raw.CompanyName || (raw.FirstName || raw.LastName ? `${raw.FirstName ?? ''} ${raw.LastName ?? ''}`.trim() : undefined),
    companyName: raw.CompanyName || undefined,
    firstName: raw.FirstName || undefined,
    lastName: raw.LastName || undefined,
    taxNumber: raw.TaxNumber || undefined,
    isCustomer: true,
    isActive: raw.IsActive ?? true,
    emails: primaryAddr?.Email ? [{ email: primaryAddr.Email }] : undefined,
    telephones: primaryAddr?.Phone1 ? [{ telephone: primaryAddr.Phone1 }] : undefined,
    billingAddress:
      primaryAddr?.Street || primaryAddr?.City
        ? {
            address1: primaryAddr.Street || undefined,
            city: primaryAddr.City || undefined,
            region: primaryAddr.State || undefined,
            postalCode: primaryAddr.PostCode || undefined,
            country: primaryAddr.Country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
