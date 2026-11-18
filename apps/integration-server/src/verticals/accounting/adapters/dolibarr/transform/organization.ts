import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface DolibarrCompany {
  id?: number | string
  name?: string
  name_alias?: string
  email?: string
  phone?: string
  fax?: string
  address?: string
  zip?: string
  town?: string
  state?: string
  country?: string
  country_code?: string
  siren?: string
  siret?: string
  idprof1?: string
  tva_intra?: string
  multicurrency_code?: string
  currency_code?: string
  [key: string]: unknown
}

export function transformOrganization(raw: DolibarrCompany): Organization {
  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tva_intra || raw.siren || raw.idprof1 || undefined,
    currency: raw.multicurrency_code || raw.currency_code || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.town,
      region: raw.state,
      postalCode: raw.zip,
      country: raw.country_code || raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
