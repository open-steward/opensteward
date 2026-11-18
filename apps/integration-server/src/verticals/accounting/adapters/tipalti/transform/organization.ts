/**
 * Tipalti payer entity → canonical Organization transform.
 *
 * The "payer entity" represents the company using Tipalti.
 * REST endpoint: GET /v1/entities  (or GET /v1/entities/{id})
 *
 * Wire fields (snake_case):
 *   id, name, legalName, taxId, currency, timezone, website,
 *   address{line1, line2, city, state, zip, country}
 */

import type { Organization } from '../../../schema/organization'

// ── Wire types ────────────────────────────────────────────────────────────────

export interface TipaltiEntityAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface TipaltiEntity {
  id?: string
  name?: string
  legalName?: string
  taxId?: string
  currency?: string
  timezone?: string
  website?: string
  address?: TipaltiEntityAddress
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: TipaltiEntity): Organization {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.taxId || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    address: raw.address
      ? {
          address1: raw.address.line1 || undefined,
          address2: raw.address.line2 || undefined,
          city: raw.address.city || undefined,
          region: raw.address.state || undefined,
          postalCode: raw.address.zip || undefined,
          country: raw.address.country || undefined,
        }
      : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
