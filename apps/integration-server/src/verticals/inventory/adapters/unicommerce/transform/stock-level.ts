/**
 * Transform Unicommerce inventory snapshot → canonical StockLevel.
 *
 * Source endpoint:
 *   POST /services/rest/v1/inventory/inventorySnapshot/get  → inventorySnapshots[]
 *
 * Snapshots are tenant-level (across all facilities unless a specific facility
 * is provided via the Facility header). facilityCode stored in metadata.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, strMap} from './shared'

export interface RawUnicommerceInventorySnapshot {
  itemTypeSKU?: string
  facilityCode?: string
  inventory?: number
  openSale?: number
  openPurchase?: number
  putawayPending?: number
  inventoryBlocked?: number
  pendingStockTransfer?: number
  vendorInventory?: number
  virtualInventory?: number
  pendingInventoryAssessment?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawUnicommerceInventorySnapshot): StockLevel {
  const sku = pickStr(raw.itemTypeSKU) ?? ''
  const facilityCode = pickStr(raw.facilityCode) ?? ''
  const onHand = raw.inventory ?? 0
  const committed = raw.openSale ?? 0
  const incoming = (raw.openPurchase ?? 0) + (raw.putawayPending ?? 0)
  const available = onHand - committed - (raw.inventoryBlocked ?? 0)

  return {
    id: `${sku}:${facilityCode || 'all'}`,
    productId: sku,
    locationId: facilityCode || 'all',
    quantityOnHand: onHand,
    quantityAvailable: available >= 0 ? available : 0,
    quantityCommitted: committed,
    quantityIncoming: incoming > 0 ? incoming : undefined,
    platform: 'unicommerce',
    metadata: strMap({
      facilityCode,
      inventoryBlocked: raw.inventoryBlocked,
      pendingStockTransfer: raw.pendingStockTransfer,
      vendorInventory: raw.vendorInventory,
      virtualInventory: raw.virtualInventory,
      pendingInventoryAssessment: raw.pendingInventoryAssessment,
    }),
    raw,
  }
}
