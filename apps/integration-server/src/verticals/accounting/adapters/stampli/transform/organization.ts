/**
 * Stampli company → canonical Organization transform.
 *
 * Wire shape (camelCase JSON):
 *   id, name, legalName, taxId, currency, timezone, website,
 *   address1, address2, city, state, postalCode, country,
 *   createdAt, updatedAt
 */
import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface StampliCompany {
  id?: string
  name?: string
  legalName?: string
  taxId?: string
  currency?: string
  timezone?: string
  website?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformOrganization(raw: StampliCompany): Organization {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    legalName: raw.legalName || raw.name || undefined,
    taxNumber: raw.taxId || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    address: toAddress({
      address1: raw.address1,
      address2: raw.address2,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postalCode,
      country: raw.country,
    }),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
