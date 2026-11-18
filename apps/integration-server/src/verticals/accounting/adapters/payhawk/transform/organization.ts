import type { Organization } from '../../../schema/organization'

// Payhawk account/organization object
// Payhawk does not expose a dedicated "company info" endpoint in the public API.
// The closest available shape is from the fund-account listing, or constructed
// from the accountId stored at connection time.  We model what fields the API
// does return if a /settings or /organization endpoint is ever available.
export interface PayhawkOrganization {
  id?: string
  name?: string
  legalName?: string
  taxNumber?: string              // company VAT/registration number
  currency?: string               // base currency
  countryCode?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  postCode?: string
  email?: string
  phone?: string
  website?: string
  [key: string]: unknown
}

export function transformOrganization(raw: PayhawkOrganization): Organization {
  return {
    name: raw.name || raw.legalName || undefined,
    legalName: raw.legalName || raw.name || undefined,
    taxNumber: raw.taxNumber || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.addressLine1 || undefined,
      address2: raw.addressLine2 || undefined,
      city: raw.city || undefined,
      postalCode: raw.postCode || undefined,
      country: raw.countryCode || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
