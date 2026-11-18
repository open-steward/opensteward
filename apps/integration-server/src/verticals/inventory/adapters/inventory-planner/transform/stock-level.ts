/**
 * Derive canonical StockLevel records from an Inventory Planner variant.
 *
 * Inventory Planner does not have a dedicated stock-level endpoint; stock data
 * is embedded in the variant object under the `warehouses` map. Each key is a
 * warehouse name (used as the locationId). When no per-warehouse breakdown is
 * present the aggregate `in_stock` is mapped as a "global" level.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'
import type { RawInventoryPlannerVariant } from './product'

/**
 * Build one StockLevel per warehouse from a variant.
 * Never throws — missing values fall back to 0 / undefined.
 */
export function transformStockLevelsFromVariant(raw: RawInventoryPlannerVariant): StockLevel[] {
  const variantId = raw._id

  if (raw.warehouses && typeof raw.warehouses === 'object') {
    return Object.entries(raw.warehouses).map(([warehouseName, wh]) => {
      const locationId = warehouseName
      return {
        id: `${variantId}:${locationId}`,
        productId: variantId,
        locationId,
        quantityOnHand: wh.in_stock ?? 0,
        quantityAvailable: undefined,
        quantityCommitted: undefined,
        quantityIncoming: wh.on_order,
        reorderPoint: wh.reorder_point,
        reorderQuantity: wh.replenishment,
        lastCountedAt: undefined,
        platform: 'inventory-planner',
        metadata: strMap({}),
        raw: { ...raw, _warehouse: warehouseName },
      }
    })
  }

  // Fall back to aggregate-level stock when no per-warehouse data present
  return [{
    id: `${variantId}:global`,
    productId: variantId,
    locationId: 'global',
    quantityOnHand: typeof raw.in_stock === 'number' ? raw.in_stock : 0,
    quantityAvailable: undefined,
    quantityCommitted: undefined,
    quantityIncoming: typeof raw.on_order === 'number' ? raw.on_order : undefined,
    reorderPoint: undefined,
    reorderQuantity: typeof raw.replenishment === 'number' ? raw.replenishment : undefined,
    lastCountedAt: undefined,
    platform: 'inventory-planner',
    metadata: strMap({}),
    raw,
  }]
}
