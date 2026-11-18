/**
 * Orca Scan row → StockLevel
 *
 * Orca Scan rows carry a `quantity` field representing on-hand stock at a
 * scan location (sheet). One row = one product at one location (sheet).
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'
import type { RawOrcaScanRow } from './product'

export function transformStockLevel(raw: RawOrcaScanRow): StockLevel {
  const qty = pickNum(raw.quantity) ?? 0
  const locationId = raw._sheetId ?? ''

  return {
    id: `${raw._id}:${locationId}`,
    productId: raw._id,
    locationId,
    quantityOnHand: qty,
    quantityAvailable: qty,
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.date),
    platform: 'orca-scan',
    metadata: strMap({ barcode: raw.barcode, location: raw.location }),
    raw,
  }
}
