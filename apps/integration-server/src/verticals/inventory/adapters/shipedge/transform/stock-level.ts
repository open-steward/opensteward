import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

/**
 * ShipEdge stock level is surfaced via the product record from
 * Inventory v2 /get_products (or /get_product).
 * Each product carries warehouse-level quantity fields.
 */
export interface RawShipEdgeStockLevel {
  product_id: string | number
  sku?: string
  /** Warehouse/distribution-center identifier associated with this record. */
  distribution_center?: { id?: string | number; name?: string }
  quantity_available?: number | string
  quantity_in_warehouse?: number | string
  /** Damaged / quarantined units. */
  quantity_hurt?: number | string
  /** Units currently in outbound shipments. */
  quantity_shipped?: number | string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawShipEdgeStockLevel): StockLevel {
  const productId = String(raw.product_id)
  const locationId = raw.distribution_center?.id != null
    ? String(raw.distribution_center.id)
    : 'default'

  const quantityAvailable = pickNum(raw.quantity_available) ?? 0
  const quantityInWarehouse = pickNum(raw.quantity_in_warehouse)
  const quantityHurt = pickNum(raw.quantity_hurt)
  const quantityShipped = pickNum(raw.quantity_shipped)

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: quantityInWarehouse ?? quantityAvailable,
    quantityAvailable,
    quantityCommitted: quantityShipped,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'shipedge',
    metadata: strMap({
      quantityHurt: quantityHurt,
      distributionCenterName: raw.distribution_center?.name,
    }),
    raw,
  }
}
