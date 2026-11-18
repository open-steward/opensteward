import type { Organization } from '../../../schema/organization'

export interface ChipaxCompanyInfo {
  nombre: string
  razonSocial: string
  rut: string
  direccion: string
  ciudad: string
  comuna: string
  pais: string
  email: string
  telefono: string
  sitioWeb: string
  moneda: string
  [key: string]: unknown
}

export function transformOrganization(raw: ChipaxCompanyInfo): Organization {
  return {
    name: raw.nombre || undefined,
    legalName: raw.razonSocial || undefined,
    taxNumber: raw.rut || undefined,
    currency: raw.moneda || undefined,
    website: raw.sitioWeb || undefined,
    address: {
      address1: raw.direccion || undefined,
      city: raw.ciudad || undefined,
      region: raw.comuna || undefined,
      country: raw.pais || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
