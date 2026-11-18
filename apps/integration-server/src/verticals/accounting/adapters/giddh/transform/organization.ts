import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface GiddhGstDetail {
  gstin: string
  [key: string]: unknown
}

export interface GiddhCompany {
  uniqueName: string
  name: string
  businessType: string
  address: string
  city: string
  state: string
  pincode: string
  country: string
  phoneNumber: string
  email: string
  website: string
  baseCurrency: string
  gstDetails: GiddhGstDetail[]
  [key: string]: unknown
}

export function transformOrganization(raw: GiddhCompany): Organization {
  const gstin = raw.gstDetails?.[0]?.gstin

  return {
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: gstin || undefined,
    currency: raw.baseCurrency || undefined,
    website: raw.website || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.pincode,
      country: toIso3166Alpha2(raw.country),
    }),
    metadata: raw as Record<string, unknown>,
  }
}
