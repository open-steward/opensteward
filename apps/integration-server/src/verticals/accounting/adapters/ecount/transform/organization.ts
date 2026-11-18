import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface EcountOrganization {
  COM_CODE?: string
  COM_NAME?: string
  OWNER_NAME?: string
  TEL?: string
  FAX?: string
  E_MAIL?: string
  ADDR?: string
  POSTAL_CODE?: string
  COUNTRY?: string
  CRNC_CODE?: string
  [key: string]: unknown
}

export function transformOrganization(raw: EcountOrganization): Organization {
  return {
    name: raw.COM_NAME || undefined,
    legalName: raw.COM_NAME || undefined,
    currency: raw.CRNC_CODE || undefined,
    address: toAddress({
      address1: raw.ADDR,
      postalCode: raw.POSTAL_CODE,
      country: raw.COUNTRY,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
