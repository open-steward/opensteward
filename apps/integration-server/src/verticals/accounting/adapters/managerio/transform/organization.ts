import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface ManagerioOrganizationAddress {
  Line1?: string
  Line2?: string
  City?: string
  State?: string
  PostalCode?: string
  Country?: string
  [key: string]: unknown
}

export interface ManagerioOrganization {
  Key: string
  BusinessName: string
  Email: string
  Phone: string
  Address: ManagerioOrganizationAddress
  TaxNumber: string
  BaseCurrency: string
  [key: string]: unknown
}

export function transformOrganization(raw: ManagerioOrganization): Organization {
  const addr = raw.Address
  return {
    id: String(raw.Key),
    name: raw.BusinessName || undefined,
    legalName: raw.BusinessName || undefined,
    taxNumber: raw.TaxNumber || undefined,
    currency: raw.BaseCurrency || undefined,
    address: addr
      ? toAddress({
          address1: addr.Line1,
          address2: addr.Line2,
          city: addr.City,
          region: addr.State,
          postalCode: addr.PostalCode,
          country: addr.Country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
