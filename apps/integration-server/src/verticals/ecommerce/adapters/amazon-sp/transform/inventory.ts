/**
 * Amazon FBA Inventory Summary → canonical InventoryLevel.
 *
 * Amazon's FBA Inventory API returns summaries keyed by `sellerSku`
 * across the seller's selected marketplaces:
 *
 *   GET /fba/inventory/v1/summaries?details=true&marketplaceIds=ATVPDKIKX0DER
 *       → { payload: { inventorySummaries: [{ sellerSku, totalQuantity,
 *                                              inventoryDetails: { fulfillableQuantity, ... } }] } }
 *
 * Amazon does not surface individual fulfillment-centre stock levels in
 * a single endpoint, so every canonical InventoryLevel uses a synthetic
 * `locationId` of `fba-default` to indicate the aggregate FBA network.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawFBAInventoryDetails {
  fulfillableQuantity?: number
  inboundWorkingQuantity?: number
  inboundShippedQuantity?: number
  inboundReceivingQuantity?: number
  reservedQuantity?: {
    totalReservedQuantity?: number
    pendingCustomerOrderQuantity?: number
    pendingTransshipmentQuantity?: number
    fcProcessingQuantity?: number
  }
  researchingQuantity?: {
    totalResearchingQuantity?: number
  }
  unfulfillableQuantity?: {
    totalUnfulfillableQuantity?: number
  }
}

export interface RawFBAInventorySummary {
  asin?: string
  fnSku?: string
  sellerSku: string
  condition?: string
  productName?: string
  totalQuantity?: number
  inventoryDetails?: RawFBAInventoryDetails
  lastUpdatedTime?: string
  [key: string]: unknown
}

const DEFAULT_LOCATION_ID = 'fba-default'

/**
 * Amazon FBA inventory summary → canonical InventoryLevel.
 *
 * The `variantId` field is set to the `sellerSku` because Amazon's
 * inventory is keyed per-SKU (there is no separate item id / variant
 * id distinction). Committed / incoming stock are populated when
 * `details=true` was supplied on the request.
 */
export function transformInventoryLevel(raw: RawFBAInventorySummary): InventoryLevel {
  const details = raw.inventoryDetails
  const available = details?.fulfillableQuantity ?? raw.totalQuantity ?? 0
  const committed = details?.reservedQuantity?.totalReservedQuantity
  const incoming =
    (details?.inboundWorkingQuantity ?? 0) +
    (details?.inboundShippedQuantity ?? 0) +
    (details?.inboundReceivingQuantity ?? 0)
  return {
    id: `${raw.sellerSku}:${DEFAULT_LOCATION_ID}`,
    variantId: raw.sellerSku,
    locationId: DEFAULT_LOCATION_ID,
    available,
    committed,
    incoming: incoming > 0 ? incoming : undefined,
    onHand: raw.totalQuantity,
    updatedAt: raw.lastUpdatedTime,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
