/**
 * Transform Wasp InventoryCloud inventory row → canonical StockLevel.
 *
 * InventoryCloud inventory search fields (from inventorysearch / advancedinventorysearch):
 *   ItemNumber    — item identifier
 *   LocationCode  — location code within a site
 *   SiteName      — site/warehouse name (top-level location)
 *   Quantity      — quantity on hand
 *   QuantityAvailable — quantity available (not committed)
 *   QuantityCommitted — quantity committed/allocated to orders
 *   QuantityOnOrder   — quantity on open purchase orders
 *   ReorderPoint  — reorder trigger threshold
 *   ReorderQuantity   — reorder quantity
 *   LastCountDate — date of last physical count
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, pickStr, strMap, toIso} from './shared'

export interface RawWaspBarcodeStockLevel {
  ItemNumber?: string
  LocationCode?: string
  SiteName?: string
  Quantity?: number | string
  QuantityAvailable?: number | string
  QuantityCommitted?: number | string
  QuantityOnOrder?: number | string
  ReorderPoint?: number | string
  ReorderQuantity?: number | string
  LastCountDate?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawWaspBarcodeStockLevel): StockLevel {
  const itemNumber = pickStr(raw.ItemNumber) ?? ''
  const locationCode = pickStr(raw.LocationCode) ?? pickStr(raw.SiteName) ?? ''
  return {
    id: `${itemNumber}:${locationCode}`,
    productId: itemNumber,
    locationId: locationCode,
    quantityOnHand: pickNum(raw.Quantity) ?? 0,
    quantityAvailable: pickNum(raw.QuantityAvailable),
    quantityCommitted: pickNum(raw.QuantityCommitted),
    quantityIncoming: pickNum(raw.QuantityOnOrder),
    reorderPoint: pickNum(raw.ReorderPoint),
    reorderQuantity: pickNum(raw.ReorderQuantity),
    lastCountedAt: toIso(raw.LastCountDate),
    platform: 'wasp-barcode',
    metadata: strMap({ siteName: raw.SiteName }),
    raw,
  }
}
