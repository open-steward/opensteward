import type { Organization } from '../../../schema/organization'

export interface NuvemFiscalEmpresa {
  razao_social: string
  nome_fantasia: string
  cnpj: string
  moeda: string
  site: string
  endereco: string
  cidade: string
  cep: string
  estado: string
  pais: string
  [key: string]: unknown
}

export function transformOrganization(raw: NuvemFiscalEmpresa): Organization {
  return {
    name: raw.nome_fantasia || undefined,
    legalName: raw.razao_social || undefined,
    taxNumber: raw.cnpj || undefined,
    currency: raw.moeda || undefined,
    website: raw.site || undefined,
    address: {
      address1: raw.endereco || undefined,
      city: raw.cidade || undefined,
      postalCode: raw.cep || undefined,
      region: raw.estado || undefined,
      country: raw.pais || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
