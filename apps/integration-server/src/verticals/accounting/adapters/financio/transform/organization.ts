import type { Organization } from '../../../schema/organization'

export interface FinancioCompany {
  id: string | number
  company_name: string
  registration_no: string
  email: string
  phone: string
  address: string
  city: string
  postcode: string
  state: string
  country: string
  currency_code: string
  gst_registered: boolean
  gst_no: string
  [key: string]: unknown
}

export function transformOrganization(raw: FinancioCompany): Organization {
  return {
    name: raw.company_name || undefined,
    legalName: raw.company_name || undefined,
    taxNumber: raw.gst_no || raw.registration_no || undefined,
    currency: raw.currency_code || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      postalCode: raw.postcode || undefined,
      region: raw.state || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
