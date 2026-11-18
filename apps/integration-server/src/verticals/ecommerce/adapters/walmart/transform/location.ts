/**
 * Walmart Ship Node → canonical Location.
 *
 * Walmart's Settings API exposes seller fulfillment centers (ship nodes):
 *   GET /v3/settings/shipping/shipnodes → list all seller ship nodes
 *
 * Each ship node represents a physical fulfillment location the seller
 * operates. The response includes the node identifier, name, status, and
 * postal address.
 */

import type { Location } from '../../../schema/location'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWalmartPostalAddress {
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  [key: string]: unknown
}

export interface RawWalmartShipNode {
  /** Walmart-assigned ship node identifier. */
  shipNode?: string
  /** Seller-assigned custom node identifier (may differ from shipNode). */
  customNodeId?: string
  shipNodeName?: string
  status?: string
  timeZone?: string
  postalAddress?: RawWalmartPostalAddress
  [key: string]: unknown
}

export interface RawWalmartShipNodesEnvelope {
  shipNodes?: RawWalmartShipNode[]
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawWalmartShipNode): Location {
  const id = raw.shipNode ?? raw.customNodeId ?? 'unknown'

  const address = raw.postalAddress
    ? {
        line1: raw.postalAddress.addressLine1,
        line2: raw.postalAddress.addressLine2,
        city: raw.postalAddress.city,
        region: raw.postalAddress.state,
        postalCode: raw.postalAddress.postalCode,
        country: raw.postalAddress.country,
      }
    : undefined

  return {
    id,
    name: raw.shipNodeName ?? raw.customNodeId ?? id,
    active: raw.status?.toUpperCase() === 'ACTIVE',
    address,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
