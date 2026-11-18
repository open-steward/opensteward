import type { Organization } from '../../../schema/organization'

export interface ColppyCompanyInfo {
  nombreEmpresa: string
  razonSocial: string
  cuit: string
  moneda: string
  sitioWeb: string
  direccion: string
  ciudad: string
  codigoPostal: string
  provincia: string
  pais: string
  [key: string]: unknown
}

export function transformOrganization(raw: ColppyCompanyInfo): Organization {
  return {
    name: raw.nombreEmpresa || undefined,
    legalName: raw.razonSocial || undefined,
    taxNumber: raw.cuit || undefined,
    currency: raw.moneda || undefined,
    website: raw.sitioWeb || undefined,
    address: {
      address1: raw.direccion || undefined,
      city: raw.ciudad || undefined,
      postalCode: raw.codigoPostal || undefined,
      region: raw.provincia || undefined,
      country: raw.pais || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
