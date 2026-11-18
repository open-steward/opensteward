/**
 * Salesforce Commerce Cloud (SCAPI) Store → canonical Location.
 *
 * SCAPI's Shopper Stores API exposes physical retail/distribution locations.
 * These map to the canonical `Location` resource.
 *
 * Reference:
 *   GET /store/shopper-stores/v1/organizations/{orgId}/stores
 *   GET /store/shopper-stores/v1/organizations/{orgId}/stores/{storeId}
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw SCAPI shapes ──────────────────────────────────────────────────────────

export interface RawScapiStore {
  id: string
  name?: string
  address1?: string | null
  address2?: string | null
  city?: string | null
  stateCode?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
  inventoryId?: string | null
  latitude?: number | null
  longitude?: number | null
  storeType?: string | null  // 'retail', 'warehouse', etc.
  enabled?: boolean
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawScapiStore): Address | undefined {
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.stateCode ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.countryCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawScapiStore): Location {
  const storeType = raw.storeType?.toLowerCase()
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    active: raw.enabled !== false,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter:
      storeType === 'warehouse' || storeType === 'distribution' ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
