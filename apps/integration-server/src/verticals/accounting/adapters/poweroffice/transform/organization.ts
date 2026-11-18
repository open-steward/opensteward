import type { Organization } from '../../../schema/organization'

export interface PowerOfficeOrganization {
  id: number
  legalName: string
  organizationNo: string
  currencyCode: string
  countryCode: string
  [key: string]: unknown
}

export function transformOrganization(raw: PowerOfficeOrganization): Organization {
  return {
    id: String(raw.id),
    name: raw.legalName || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.organizationNo || undefined,
    currency: raw.currencyCode || undefined,
    address: raw.countryCode
      ? {
          country: raw.countryCode || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
