import type { Organization } from '../../../schema/organization'

export interface XubioOrganization {
  razonSocial: string
  cuit: string
  direccion: string
  ciudad: string
  codigoPostal: string
  provincia: string
  pais: string
  email: string
  telefono: string
  sitioWeb: string
  moneda: string
  [key: string]: unknown
}

export function transformOrganization(raw: XubioOrganization): Organization {
  return {
    name: raw.razonSocial || undefined,
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
