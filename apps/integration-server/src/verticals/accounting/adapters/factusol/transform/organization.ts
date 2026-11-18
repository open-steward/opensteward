/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Organization } from '../../../schema/organization'

export interface FactusolOrganization {
  nombre: string
  razon_social: string
  nif: string
  divisa: string
  web: string
  direccion: string
  ciudad: string
  codigo_postal: string
  pais: string
  provincia: string
  [key: string]: unknown
}

export function transformOrganization(raw: FactusolOrganization): Organization {
  return {
    name: raw.nombre || undefined,
    legalName: raw.razon_social || undefined,
    taxNumber: raw.nif || undefined,
    currency: raw.divisa || undefined,
    website: raw.web || undefined,
    address: {
      address1: raw.direccion || undefined,
      city: raw.ciudad || undefined,
      postalCode: raw.codigo_postal || undefined,
      country: raw.pais || undefined,
      region: raw.provincia || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
