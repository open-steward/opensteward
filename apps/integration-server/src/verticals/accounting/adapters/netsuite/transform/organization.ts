import type { Organization } from '../../../schema/organization'

export interface NetSuiteCompany {
  id?: string | number
  name?: string
  legalName?: string
  fein?: string
  subsidiaryOf?: string
  currency?: string
  country?: string
  addr1?: string
  city?: string
  state?: string
  zip?: string
  [key: string]: unknown
}

export function transformOrganization(raw: NetSuiteCompany): Organization {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.fein || undefined,
    currency: raw.currency || undefined,
    address:
      raw.addr1 || raw.city || raw.country
        ? {
            address1: raw.addr1 || undefined,
            city: raw.city || undefined,
            region: raw.state || undefined,
            postalCode: raw.zip || undefined,
            country: raw.country || undefined,
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
