import type { Organization } from '../../../schema/organization'

export interface NiboOrganization {
  companyName: string
  tradeName: string
  cnpj: string
  stateRegistration: string
  street: string
  complement: string
  city: string
  zipCode: string
  state: string
  country: string
  email: string
  phone: string
  website: string
  currencyCode: string
  [key: string]: unknown
}

export function transformOrganization(raw: NiboOrganization): Organization {
  return {
    name: raw.tradeName || raw.companyName || undefined,
    legalName: raw.companyName || undefined,
    taxNumber: raw.cnpj || undefined,
    currency: raw.currencyCode || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.street || undefined,
      address2: raw.complement || undefined,
      city: raw.city || undefined,
      postalCode: raw.zipCode || undefined,
      region: raw.state || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
