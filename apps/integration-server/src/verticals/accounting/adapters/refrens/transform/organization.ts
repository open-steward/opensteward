/**
 * Refrens business → canonical Organization.
 *
 * From GET /businesses (list) or the business field on credentials:
 *   _id, name, country, gstin, urlKey, currency,
 *   billedTo.{ name, street, city, pincode, gstState, country },
 *   users[].{ name, email, _id }
 *   createdAt, updatedAt
 */

import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

// ── Raw Refrens business type ─────────────────────────────────────────────────

export interface RefrensBusiness {
  _id?: string
  name?: string
  country?: string
  gstin?: string
  urlKey?: string
  currency?: string
  billedTo?: {
    name?: string
    street?: string
    city?: string
    pincode?: string
    gstState?: string
    country?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformOrganization(raw: RefrensBusiness): Organization {
  const billedTo = raw.billedTo ?? {}

  return {
    id: raw._id || undefined,
    name: raw.name || billedTo.name || undefined,
    legalName: raw.name || billedTo.name || undefined,
    organizationCode: raw.urlKey || undefined,
    taxNumber: raw.gstin || undefined,
    currency: raw.currency || undefined,
    address: toAddress({
      address1: billedTo.street,
      city: billedTo.city,
      postalCode: billedTo.pincode,
      region: billedTo.gstState,
      country: raw.country || billedTo.country,
    }),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
