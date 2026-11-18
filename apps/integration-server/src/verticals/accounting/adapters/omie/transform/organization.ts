import type { Organization } from '../../../schema/organization'

export interface OmieOrganization {
  razao_social: string
  nome_fantasia: string
  cnpj: string
  inscricao_estadual: string
  endereco: string
  complemento: string
  cidade: string
  cep: string
  estado: string
  pais: string
  email: string
  telefone: string
  site: string
  moeda: string
  [key: string]: unknown
}

export function transformOrganization(raw: OmieOrganization): Organization {
  return {
    name: raw.nome_fantasia || raw.razao_social || undefined,
    legalName: raw.razao_social || undefined,
    taxNumber: raw.cnpj || undefined,
    currency: raw.moeda || undefined,
    website: raw.site || undefined,
    address: {
      address1: raw.endereco || undefined,
      address2: raw.complemento || undefined,
      city: raw.cidade || undefined,
      postalCode: raw.cep || undefined,
      region: raw.estado || undefined,
      country: raw.pais || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
