import type { Organization } from '../../../schema/organization'

export interface IntacctOrganization {
  RECORDNO: string
  COMPANYNAME: string
  LEGALNAME: string
  TAXID: string
  CURRENCY: string
  ADDRESS1: string
  CITY: string
  STATE: string
  ZIP: string
  COUNTRY: string
  PHONE1: string
  EMAIL1: string
  [key: string]: unknown
}

export function transformOrganization(raw: IntacctOrganization): Organization {
  return {
    id: raw.RECORDNO,
    name: raw.COMPANYNAME || undefined,
    legalName: raw.LEGALNAME || raw.COMPANYNAME || undefined,
    taxNumber: raw.TAXID || undefined,
    currency: raw.CURRENCY || undefined,
    address: {
      address1: raw.ADDRESS1 || undefined,
      city: raw.CITY || undefined,
      region: raw.STATE || undefined,
      postalCode: raw.ZIP || undefined,
      country: raw.COUNTRY || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
