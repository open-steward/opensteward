/**
 * RealBooks → canonical Organization transform.
 *
 * Organisation details come from the Segment master
 * (POST /AMSSERVICE/api/segment/update/{cid}) or from the segment list
 * (POST /AMSSERVICE/api/segment/segidsegname).
 */

import type { Organization } from '../../../schema/organization'

// ── RealBooks wire types ──────────────────────────────────────────────────────

export interface RealBooksSegmentAddress {
  address?: string
  state?: string
  city?: string
  pin?: string
  email?: string
  phoneNo?: string
  mobileNo?: string
  faxNo?: string
  [key: string]: unknown
}

export interface RealBooksTaxInfo {
  serviceTaxNo?: string
  vatNo?: string
  panNo?: string
  tinNo?: string
  cinNo?: string
  cstNo?: string
  [key: string]: unknown
}

export interface RealBooksSegment {
  id?: number
  name?: string
  shortName?: string
  code?: string
  country?: string
  currency?: string
  address?: RealBooksSegmentAddress
  taxInfo?: RealBooksTaxInfo
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: RealBooksSegment): Organization {
  const addr = raw.address ?? {}
  const taxInfo = raw.taxInfo ?? {}

  return {
    id: raw.id !== undefined ? String(raw.id) : raw.code,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    organizationCode: raw.code || undefined,
    taxNumber: taxInfo.panNo || taxInfo.vatNo || taxInfo.tinNo || undefined,
    currency: raw.currency || undefined,
    address: {
      address1: addr.address || undefined,
      city: addr.city || undefined,
      region: addr.state || undefined,
      postalCode: addr.pin || undefined,
      country: raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
