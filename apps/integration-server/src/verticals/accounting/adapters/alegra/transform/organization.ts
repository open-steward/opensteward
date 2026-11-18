import type { Organization } from '../../../schema/organization'

export interface AlegraCompanyInfo {
  id: number
  name: string
  identification: string
  address: string
  city: string
  department: string
  country: string
  email: string
  phone: string
  website: string
  currency: string
  [key: string]: unknown
}

export function transformOrganization(raw: AlegraCompanyInfo): Organization {
  return {
    id: raw.id ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.identification || undefined,
    currency: raw.currency || undefined,
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      region: raw.department || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
