import type { Organization } from '../../../schema/organization'

export interface BillyOrganization {
  id: string
  name: string
  registrationNo: string
  baseCurrencyId: string
  street: string
  cityText: string
  zipcodeText: string
  countryId: string
  phone: string
  url: string
  [key: string]: unknown
}

export function transformOrganization(raw: BillyOrganization): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.registrationNo || undefined,
    currency: raw.baseCurrencyId || undefined,
    website: raw.url || undefined,
    address: {
      address1: raw.street || undefined,
      city: raw.cityText || undefined,
      postalCode: raw.zipcodeText || undefined,
      country: raw.countryId || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
