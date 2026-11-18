import type { Organization } from '../../../schema/organization'

export interface ContabiliumCompanyInfo {
  nombre: string
  razonSocial: string
  cuit: string
  direccion: string
  localidad: string
  provincia: string
  codigoPostal: string
  pais: string
  email: string
  telefono: string
  sitioWeb: string
  moneda: string
  [key: string]: unknown
}

export function transformOrganization(raw: ContabiliumCompanyInfo): Organization {
  return {
    name: raw.nombre || undefined,
    legalName: raw.razonSocial || undefined,
    taxNumber: raw.cuit || undefined,
    currency: raw.moneda || undefined,
    website: raw.sitioWeb || undefined,
    address: {
      address1: raw.direccion || undefined,
      city: raw.localidad || undefined,
      region: raw.provincia || undefined,
      postalCode: raw.codigoPostal || undefined,
      country: raw.pais || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
