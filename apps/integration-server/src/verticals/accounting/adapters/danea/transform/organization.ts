/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Organization } from '../../../schema/organization'

export interface DaneaAzienda {
  RagioneSociale: string
  PartitaIva: string
  CodiceFiscale: string
  Indirizzo: string
  Citta: string
  Cap: string
  Provincia: string
  Paese: string
  Email: string
  Telefono: string
  SitoWeb: string
  Valuta: string
  [key: string]: unknown
}

export function transformOrganization(raw: DaneaAzienda): Organization {
  return {
    name: raw.RagioneSociale || undefined,
    legalName: raw.RagioneSociale || undefined,
    taxNumber: raw.PartitaIva || undefined,
    currency: raw.Valuta || undefined,
    website: raw.SitoWeb || undefined,
    address: {
      address1: raw.Indirizzo || undefined,
      city: raw.Citta || undefined,
      postalCode: raw.Cap || undefined,
      region: raw.Provincia || undefined,
      country: raw.Paese || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
