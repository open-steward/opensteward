import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface AcumaticaOrganization {
  CompanyID: string
  CompanyName: string
  TaxRegistrationID: string
  Email: string
  Phone: string
  Address: {
    AddressLine1: string
    AddressLine2: string
    City: string
    PostalCode: string
    CountryID: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformOrganization(raw: AcumaticaOrganization): Organization {
  return {
    name: raw.CompanyName || undefined,
    legalName: raw.CompanyName || undefined,
    taxNumber: raw.TaxRegistrationID || undefined,
    address: toAddress({
      address1: raw.Address?.AddressLine1,
      address2: raw.Address?.AddressLine2,
      city: raw.Address?.City,
      postalCode: raw.Address?.PostalCode,
      country: raw.Address?.CountryID,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
