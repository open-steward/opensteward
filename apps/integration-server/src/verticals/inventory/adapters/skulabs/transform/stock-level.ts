import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawSkulabsInventoryItem {
  item_id: string
  location_id?: string
  on_hand?: number
  inbound?: number | null
  alert?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSkulabsInventoryItem): StockLevel {
  const locationId = raw.location_id ?? ''
  return {
    id: `${raw.item_id}:${locationId}`,
    productId: raw.item_id,
    locationId,
    quantityOnHand: raw.on_hand ?? 0,
    quantityIncoming: raw.inbound ?? undefined,
    reorderPoint: raw.alert,
    platform: 'skulabs',
    metadata: strMap({}),
    raw,
  }
}
