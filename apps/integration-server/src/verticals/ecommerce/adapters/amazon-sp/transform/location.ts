/**
 * Amazon SP-API Supply Sources → canonical Location.
 *
 * Amazon's Supply Sources API (v2020-07-01) represents seller warehouses,
 * stores, and distribution points that hold inventory for multi-location
 * inventory (MLI) scenarios. Each supply source maps cleanly onto the
 * canonical Location shape.
 *
 * API base path: /supplySources/2020-07-01/supplySources
 * Ref: https://developer-docs.amazon.com/sp-api/docs/supply-sources-api
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw shape ────────────────────────────────────────────────────────────────

/** Address as returned by the Supply Sources API. */
export interface RawSupplySourceAddress {
  name?: string
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  city?: string
  county?: string
  district?: string
  stateOrRegion?: string
  postalCode?: string
  countryCode?: string
  phone?: string
}

/**
 * Single supply source entry from the GET /supplySources list or
 * GET /supplySources/{supplySourceId} response.
 */
export interface RawSupplySource {
  supplySourceId?: string
  supplySourceCode?: string
  /** Seller-assigned human-readable name. */
  alias?: string
  /** "Active" | "Inactive" | "Archived" */
  status?: string
  address?: RawSupplySourceAddress
  capabilities?: Record<string, unknown>
  [key: string]: unknown
}

/** GET /supplySources response envelope. */
export interface RawGetSupplySourcesResponse {
  supplySources?: RawSupplySource[]
  nextPageToken?: string
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Map a raw Supply Source to the canonical Location shape.
 */
export function transformLocation(raw: RawSupplySource): Location {
  const addr = raw.address

  let address: Address | undefined
  if (addr) {
    address = {
      line1: addr.addressLine1,
      line2: [addr.addressLine2, addr.addressLine3].filter(Boolean).join(', ') || undefined,
      city: addr.city,
      region: addr.stateOrRegion,
      postalCode: addr.postalCode,
      country: addr.countryCode,
    }
  }

  const isActive = raw.status === 'Active'

  return {
    id: raw.supplySourceId ?? raw.supplySourceCode ?? '',
    name: raw.alias ?? raw.supplySourceCode ?? raw.supplySourceId ?? '',
    active: isActive,
    address,
    phone: addr?.phone,
    // Supply sources are fulfillment-capable unless status indicates otherwise
    isFulfillmentCenter: isActive,
    metadata: {
      supplySourceCode: raw.supplySourceCode,
      status: raw.status,
      capabilities: raw.capabilities,
      raw,
    },
  }
}
