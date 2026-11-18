import type { Organization } from '../../../schema/organization'

export interface FastbillOrganization {
  CLIENT_ID: string
  ORGANIZATION: string
  EMAIL: string
  PHONE: string
  STREET: string
  ZIPCODE: string
  CITY: string
  COUNTRY_CODE: string
  CURRENCY_CODE: string
  VAT_ID: string
  [key: string]: unknown
}

export function transformOrganization(raw: FastbillOrganization): Organization {
  return {
    name: raw.ORGANIZATION || undefined,
    legalName: raw.ORGANIZATION || undefined,
    taxNumber: raw.VAT_ID || undefined,
    currency: raw.CURRENCY_CODE || undefined,
    address: {
      address1: raw.STREET || undefined,
      city: raw.CITY || undefined,
      postalCode: raw.ZIPCODE || undefined,
      country: raw.COUNTRY_CODE || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}

export type FastBillOrganization = FastbillOrganization
