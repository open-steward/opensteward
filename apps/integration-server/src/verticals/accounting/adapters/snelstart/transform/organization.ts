import type { Organization } from '../../../schema/organization'

export interface SnelStartOrganization {
  id: string
  naam: string
  rechtsvorm: string
  kvkNummer: string
  btwNummer: string
  valutacode: string
  adres: {
    straat: string
    postcode: string
    plaats: string
    land: string
  } | null
  [key: string]: unknown
}

export function transformOrganization(raw: SnelStartOrganization): Organization {
  return {
    id: raw.id,
    name: raw.naam || undefined,
    legalName: raw.rechtsvorm ? `${raw.naam} ${raw.rechtsvorm}`.trim() : raw.naam || undefined,
    taxNumber: raw.btwNummer || raw.kvkNummer || undefined,
    currency: raw.valutacode || undefined,
    address: {
      address1: raw.adres?.straat || undefined,
      city: raw.adres?.plaats || undefined,
      postalCode: raw.adres?.postcode || undefined,
      country: raw.adres?.land || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
