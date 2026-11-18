/**
 * SAP Commerce Cloud Stock → canonical InventoryLevel.
 *
 * SAP Commerce exposes stock levels on products via `stock` field or
 * through dedicated stock endpoints. Stock is tracked per warehouse
 * (point of service / store).
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawSapStockLevel {
  productCode?: string
  warehouseCode?: string
  available?: number
  reserved?: number
  inStockStatus?: string
  stockLevel?: number
  stockLevelStatus?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawSapStockLevel): InventoryLevel {
  const available = raw.available ?? raw.stockLevel ?? 0
  return {
    id: `${raw.productCode ?? 'unknown'}:${raw.warehouseCode ?? 'default'}`,
    variantId: raw.productCode ?? '',
    locationId: raw.warehouseCode ?? 'default',
    available,
    committed: raw.reserved,
    onHand: raw.reserved != null ? available + raw.reserved : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformInventoryLevel(
  level: Partial<InventoryLevel>,
): Record<string, unknown> {
  return {
    productCode: level.variantId,
    warehouseCode: level.locationId,
    available: level.available,
  }
}
