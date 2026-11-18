import type { Organization } from '../../../schema/organization'

export interface ContaAzulCompanyInfo {
  id: string
  name: string
  company_name: string
  cnpj: string
  address: string
  complement: string
  city: string
  state: string
  postal_code: string
  country: string
  email: string
  phone: string
  website: string
  [key: string]: unknown
}

export function transformOrganization(raw: ContaAzulCompanyInfo): Organization {
  return {
    id: raw.id || undefined,
    name: raw.company_name || raw.name || undefined,
    legalName: raw.company_name || undefined,
    taxNumber: raw.cnpj || undefined,
    currency: 'BRL',
    website: raw.website || undefined,
    address: {
      address1: raw.address || undefined,
      address2: raw.complement || undefined,
      city: raw.city || undefined,
      region: raw.state || undefined,
      postalCode: raw.postal_code || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
