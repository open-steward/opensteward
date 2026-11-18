import type { Organization } from '../../../schema/organization'

export interface FacturamaCompanyInfo {
  TaxName: string
  LegalName: string
  Rfc: string
  TaxRegime: string
  Email: string
  Phone: string
  Website: string
  CurrencyCode: string
  Address: {
    Street: string
    ExteriorNumber: string
    InteriorNumber: string
    Neighborhood: string
    ZipCode: string
    Municipality: string
    State: string
    Country: string
  }
  [key: string]: unknown
}

export function transformOrganization(raw: FacturamaCompanyInfo): Organization {
  const addr = raw.Address
  const address1 = addr
    ? [addr.Street, addr.ExteriorNumber, addr.InteriorNumber].filter(Boolean).join(' ')
    : undefined

  return {
    name: raw.TaxName || undefined,
    legalName: raw.LegalName || undefined,
    taxNumber: raw.Rfc || undefined,
    currency: raw.CurrencyCode || undefined,
    website: raw.Website || undefined,
    address: addr
      ? {
          address1,
          city: addr.Municipality || undefined,
          region: addr.State || undefined,
          postalCode: addr.ZipCode || undefined,
          country: addr.Country || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
