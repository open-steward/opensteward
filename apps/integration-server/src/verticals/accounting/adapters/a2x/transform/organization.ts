/**
 * A2X Organisation → canonical Organization transform.
 *
 * A2X exposes the connected merchant's profile as an organisation resource.
 *
 * A2X REST organisation shape:
 * {
 *   id:            number
 *   name:          string
 *   legal_name?:   string
 *   country?:      string   (ISO-3166-2 country code)
 *   currency?:     string   (ISO-4217)
 *   timezone?:     string   (IANA tz, e.g. "America/New_York")
 *   website?:      string
 *   created_at:    string
 *   updated_at:    string
 * }
 */

import type { Organization } from '../../../schema/organization'

export interface A2xOrganisation {
  id: number
  name: string
  legal_name?: string
  country?: string
  currency?: string
  timezone?: string
  website?: string
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export function transformOrganization(raw: A2xOrganisation): Organization {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    legalName: raw.legal_name || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
