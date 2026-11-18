import type { Organization } from '../../../schema/organization'

export interface ZucchettiAzienda {
  ragione_sociale: string
  partita_iva: string
  codice_fiscale: string
  indirizzo: string
  citta: string
  cap: string
  provincia: string
  paese: string
  email: string
  telefono: string
  sito_web: string
  valuta: string
  [key: string]: unknown
}

export function transformOrganization(raw: ZucchettiAzienda): Organization {
  return {
    name: raw.ragione_sociale || undefined,
    legalName: raw.ragione_sociale || undefined,
    taxNumber: raw.partita_iva || undefined,
    currency: raw.valuta || undefined,
    website: raw.sito_web || undefined,
    address: {
      address1: raw.indirizzo || undefined,
      city: raw.citta || undefined,
      postalCode: raw.cap || undefined,
      region: raw.provincia || undefined,
      country: raw.paese || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
