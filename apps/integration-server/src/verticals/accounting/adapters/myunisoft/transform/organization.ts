import type { Organization } from '../../../schema/organization'

export interface MyunisoftOrganization {
  id: string
  nom: string
  raison_sociale: string
  siret: string
  numero_tva: string
  adresse: string
  code_postal: string
  ville: string
  pays: string
  email: string
  telephone: string
  site_web: string
  devise: string
  [key: string]: unknown
}

export function transformOrganization(raw: MyunisoftOrganization): Organization {
  return {
    name: raw.nom || undefined,
    legalName: raw.raison_sociale || undefined,
    taxNumber: raw.siret || undefined,
    currency: raw.devise || undefined,
    website: raw.site_web || undefined,
    address: {
      address1: raw.adresse || undefined,
      city: raw.ville || undefined,
      postalCode: raw.code_postal || undefined,
      country: raw.pays || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
