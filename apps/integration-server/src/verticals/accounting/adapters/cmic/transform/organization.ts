import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface CmicOrganization {
  CompanyId: string
  CompanyName: string
  LegalName: string
  TaxId: string
  Email: string
  Phone: string
  Address: string
  City: string
  State: string
  PostalCode: string
  Country: string
  [key: string]: unknown
}

export function transformOrganization(raw: CmicOrganization): Organization {
  return {
    name: raw.CompanyName || undefined,
    legalName: raw.LegalName || raw.CompanyName || undefined,
    taxNumber: raw.TaxId || undefined,
    address: toAddress({
      address1: raw.Address,
      city: raw.City,
      region: raw.State,
      postalCode: raw.PostalCode,
      country: raw.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
