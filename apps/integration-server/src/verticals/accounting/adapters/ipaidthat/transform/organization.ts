import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface IpaidthatOrganization {
  id: string
  nom?: string
  raison_sociale?: string
  siret?: string
  numero_tva?: string
  adresse?: string
  code_postal?: string
  ville?: string
  pays?: string
  email?: string
  telephone?: string
  site_web?: string
  devise?: string
  [key: string]: unknown
}

export function transformOrganization(raw: IpaidthatOrganization): Organization {
  return {
    name: raw.nom || undefined,
    legalName: raw.raison_sociale || undefined,
    taxNumber: raw.siret || undefined,
    currency: raw.devise || undefined,
    website: raw.site_web || undefined,
    address: toAddress({
      address1: raw.adresse,
      city: raw.ville,
      postalCode: raw.code_postal,
      country: raw.pays,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
