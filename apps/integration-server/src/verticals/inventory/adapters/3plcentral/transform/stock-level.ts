/**
 * Transform a 3PL Central stock-details record (from GET /inventory/stockdetails
 * or GET /inventory/stocksummaries) into a canonical StockLevel.
 *
 * stockdetails: per-receive-lot row; itemIdentifier.id + locationIdentifier.id give the key.
 * stocksummaries: aggregated per item+facility; keys are itemIdentifier.id + facilityIdentifier.id.
 *
 * We handle both shapes: stockdetails has onHandQty / availableQty; stocksummaries has
 * onHand / available / allocated / on_hand (post-transform snake_case from tap).
 * The raw HAL response uses camelCase: onHandQty, availableQty, onHoldQty.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

/** Shape from GET /inventory/stockdetails (per-receipt-lot row) */
export interface Raw3plCentralStockDetail {
  receiveItemId?: number
  itemIdentifier?: { sku?: string; id?: number }
  locationIdentifier?: {
    nameKey?: { facilityIdentifier?: { name?: string; id?: number }; name?: string }
    id?: number
  }
  facilityIdentifier?: { name?: string; id?: number }
  onHandQty?: number
  availableQty?: number
  onHoldQty?: number
  receivedQty?: number
  supplierIdentifier?: { name?: string; id?: number }
  expirationDate?: string
  lotNumber?: string
  serialNumber?: string
  receivedDate?: string
  [key: string]: unknown
}

/** Shape from GET /inventory/stocksummaries (aggregated per item+facility) */
export interface Raw3plCentralStockSummary {
  facilityIdentifier?: { name?: string; id?: number }
  itemIdentifier?: { sku?: string; id?: number }
  onHand?: number
  available?: number
  allocated?: number
  on_hand?: number       // post-tap snake_case variant
  total_received?: number
  [key: string]: unknown
}

export type Raw3plCentralStockLevel = Raw3plCentralStockDetail | Raw3plCentralStockSummary

function isDetail(r: Raw3plCentralStockLevel): r is Raw3plCentralStockDetail {
  return 'receiveItemId' in r || 'onHandQty' in r
}

export function transformStockLevel(raw: Raw3plCentralStockLevel): StockLevel {
  const itemId = String(raw.itemIdentifier?.id ?? '')
  const itemSku = raw.itemIdentifier?.sku ?? itemId

  if (isDetail(raw)) {
    const locationId = raw.locationIdentifier?.id !== undefined
      ? String(raw.locationIdentifier.id)
      : String(raw.facilityIdentifier?.id ?? '')
    const receiveId = raw.receiveItemId !== undefined ? String(raw.receiveItemId) : `${itemId}:${locationId}`

    return {
      id: receiveId,
      productId: itemId,
      locationId,
      quantityOnHand: raw.onHandQty ?? 0,
      quantityAvailable: raw.availableQty,
      quantityCommitted: raw.onHoldQty,
      quantityIncoming: undefined,
      reorderPoint: undefined,
      reorderQuantity: undefined,
      lastCountedAt: toIso(raw.receivedDate),
      platform: '3plcentral',
      metadata: strMap({
        sku: itemSku,
        lotNumber: raw.lotNumber,
        serialNumber: raw.serialNumber,
        supplierName: raw.supplierIdentifier?.name,
        supplierId: raw.supplierIdentifier?.id,
        expirationDate: raw.expirationDate,
        locationName: raw.locationIdentifier?.nameKey?.name,
        facilityName: raw.locationIdentifier?.nameKey?.facilityIdentifier?.name,
      }),
      raw,
    }
  }

  // Summary row
  const facilityId = String((raw as Raw3plCentralStockSummary).facilityIdentifier?.id ?? '')
  const id = `${itemId}:${facilityId}`
  const s = raw as Raw3plCentralStockSummary

  return {
    id,
    productId: itemId,
    locationId: facilityId,
    quantityOnHand: s.onHand ?? s.on_hand ?? 0,
    quantityAvailable: s.available,
    quantityCommitted: s.allocated,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: '3plcentral',
    metadata: strMap({ sku: itemSku, facilityId }),
    raw,
  }
}
