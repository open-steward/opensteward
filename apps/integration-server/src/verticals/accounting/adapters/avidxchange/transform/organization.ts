/**
 * AvidXchange company/organization transform → canonical Organization.
 *
 * Key company fields (camelCase on the wire):
 *   companyId, companyName, legalName, taxId,
 *   address1, address2, city, state, postalCode, country,
 *   currency, timezone, createdDate, modifiedDate
 */
import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface AvidXchangeCompany {
  companyId?: string
  companyName?: string
  legalName?: string
  taxId?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  currency?: string
  timezone?: string
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export function transformOrganization(raw: AvidXchangeCompany): Organization {
  return {
    id: raw.companyId || undefined,
    name: raw.companyName || undefined,
    legalName: raw.legalName || raw.companyName || undefined,
    taxNumber: raw.taxId || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    address: toAddress({
      address1: raw.address1,
      address2: raw.address2,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postalCode,
      country: raw.country,
    }),
    createdAt: raw.createdDate ? new Date(raw.createdDate) : undefined,
    updatedAt: raw.modifiedDate ? new Date(raw.modifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
