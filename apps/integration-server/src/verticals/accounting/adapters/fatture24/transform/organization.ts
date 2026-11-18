import type { Organization } from '../../../schema/organization'

export interface Fatture24Azienda {
  RagioneSociale: string
  PartitaIva: string
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

export function transformOrganization(raw: Fatture24Azienda): Organization {
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
