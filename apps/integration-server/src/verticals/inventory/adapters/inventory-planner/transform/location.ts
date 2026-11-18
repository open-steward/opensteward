/**
 * Derive canonical Location records from Inventory Planner variant data.
 *
 * Inventory Planner has no dedicated warehouse/location endpoint. Warehouse
 * identifiers surface as keys in the per-variant `warehouses` map returned by
 * GET /api/v1/variants. Each unique warehouse name is treated as a Location.
 *
 * Derivation logic:
 *   - id / externalId = warehouse name (the key Inventory Planner uses natively)
 *   - name = same warehouse name
 *   - type = 'warehouse' (all Inventory Planner locations are warehouses)
 *   - isActive = true (only active warehouses appear in the variant payload)
 *   - No address data — Inventory Planner does not expose address fields
 */
import type { Location } from '../../../schema/location'
import {strMap} from './shared'
import type { RawInventoryPlannerVariant } from './product'

/**
 * Extract the set of unique warehouse names from a list of variants and return
 * one canonical Location per warehouse.
 */
export function deriveLocationsFromVariants(variants: RawInventoryPlannerVariant[]): Location[] {
  const seen = new Set<string>()
  const locations: Location[] = []

  for (const variant of variants) {
    if (!variant.warehouses || typeof variant.warehouses !== 'object') continue
    for (const warehouseName of Object.keys(variant.warehouses)) {
      if (!warehouseName || seen.has(warehouseName)) continue
      seen.add(warehouseName)
      locations.push(deriveLocation(warehouseName))
    }
  }

  return locations
}

/**
 * Build a single Location from a warehouse name string.
 */
export function deriveLocation(warehouseName: string): Location {
  return {
    id: warehouseName,
    externalId: warehouseName,
    name: warehouseName,
    code: undefined,
    type: 'warehouse',
    parentLocationId: undefined,
    address: undefined,
    isActive: true,
    platform: 'inventory-planner',
    metadata: strMap({}),
    raw: { warehouse: warehouseName },
  }
}
