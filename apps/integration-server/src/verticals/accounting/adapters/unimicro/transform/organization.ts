import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface UnimicroOrganization {
  ID?: number
  CompanyName?: string
  OrganizationNumber?: string
  CompanyVATNumber?: string
  DefaultEmail?: { EmailAddress?: string }
  DefaultPhone?: { Number?: string }
  DefaultAddress?: {
    AddressLine1?: string
    City?: string
    PostalCode?: string
    Country?: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: UnimicroOrganization): Organization {
  return {
    id: String(raw.ID ?? ''),
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.OrganizationNumber || undefined,
    address: toAddress({
      address1: raw.DefaultAddress?.AddressLine1,
      city: raw.DefaultAddress?.City,
      postalCode: raw.DefaultAddress?.PostalCode,
      country: raw.DefaultAddress?.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
