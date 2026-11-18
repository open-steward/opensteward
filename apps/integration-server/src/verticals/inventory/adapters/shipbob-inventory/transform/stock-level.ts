import type { StockLevel } from '../../../schema/stock-level'

/**
 * `GET /2026-01/inventory-level/locations` — fields read from ShipBob's
 * OpenAPI document (https://marketplaceapi.shipbob.com/docs/2026-01.json,
 * fetched 2026-09-18):
 *
 *   items[]:            inventory_id, name, sku, locations[]
 *   items[].locations[]: location_id, name, on_hand_quantity,
 *                        fulfillable_quantity, committed_quantity,
 *                        awaiting_quantity, internal_transfer_quantity
 *
 * This route, not the plain `/inventory-level`, is the right source for a
 * canonical StockLevel. `/inventory-level` returns `total_*` fields — the
 * vendor's own naming for quantities summed across every fulfilment centre —
 * and a canonical stock level is per (product, location). Reporting a
 * network-wide total against one warehouse would be a quiet lie; the required
 * `locationId` on the schema is what makes that impossible to write by
 * accident.
 *
 * One ShipBob inventory item spanning three fulfilment centres therefore
 * becomes three canonical rows, which is why the transform takes the parent
 * and one location rather than the item alone.
 */
export interface RawShipBobLocationLevel {
  location_id?: number
  name?: string | null
  on_hand_quantity?: number | null
  fulfillable_quantity?: number | null
  committed_quantity?: number | null
  awaiting_quantity?: number | null
  internal_transfer_quantity?: number | null
  [key: string]: unknown
}

export interface RawShipBobInventoryLevel {
  inventory_id?: number
  name?: string | null
  sku?: string | null
  locations?: RawShipBobLocationLevel[] | null
  [key: string]: unknown
}

/**
 * One canonical row per (inventory item, location).
 *
 * The id is composite because neither part is unique on its own: the same
 * inventory item appears at several locations, and a location holds many
 * items.
 */
export function transformStockLevel(
  parent: RawShipBobInventoryLevel,
  location: RawShipBobLocationLevel,
): StockLevel {
  const inventoryId = String(parent.inventory_id ?? '')
  const locationId = String(location.location_id ?? '')
  return {
    id: `${inventoryId}:${locationId}`,
    externalId: `${inventoryId}:${locationId}`,
    productId: inventoryId,
    locationId,
    quantityOnHand: location.on_hand_quantity ?? 0,
    quantityAvailable: location.fulfillable_quantity ?? undefined,
    quantityCommitted: location.committed_quantity ?? undefined,
    // `awaiting` is stock ShipBob expects to receive at this centre, which is
    // what the canonical incoming field means.
    quantityIncoming: location.awaiting_quantity ?? undefined,
    // `quantityOutgoing` is deliberately unset. The canonical field means
    // "committed to fulfilment"; the only candidate ShipBob sends per location,
    // `internal_transfer_quantity`, is stock moving between its OWN centres —
    // not leaving the network, not for an order. It used to fill this field.
    // It stays on `raw` for anyone who wants transfers.
    platform: 'shipbob-inventory',
    metadata: {},
    raw: { ...parent, location } as unknown as Record<string, unknown>,
  }
}

/** Flatten one API row into its per-location canonical rows. */
export function flattenStockLevels(parent: RawShipBobInventoryLevel): StockLevel[] {
  return (parent.locations ?? [])
    .filter((l) => l.location_id != null)
    .map((l) => transformStockLevel(parent, l))
}
