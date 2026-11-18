/**
 * Transform a raw Pickware bin-location object (GET /api/binLocations/{id})
 * into one or more canonical StockLevel records — one per article mapping.
 *
 * Pickware bin-location detail response fields:
 *   id (integer), warehouseId (integer), code (string),
 *   articleDetailBinLocationMappings: Array<{
 *     id, binLocationId, articleDetailId,
 *     stock (integer), defaultMapping (boolean),
 *     reservedStock (integer), lastStockTake (timestamp|null)
 *   }>
 *
 * The flat list variant (GET /api/binLocations) omits the mappings array, so
 * transformStockLevelsFromBinLocation handles the full detail shape only.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawPickwareBinLocationMapping {
  id: number | string
  binLocationId: number | string
  articleDetailId: number | string
  stock?: number
  defaultMapping?: boolean
  reservedStock?: number
  lastStockTake?: string | null
  [key: string]: unknown
}

export interface RawPickwareBinLocation {
  id: number | string
  warehouseId?: number | string
  code?: string
  articleDetailBinLocationMappings?: RawPickwareBinLocationMapping[]
  [key: string]: unknown
}

/**
 * Expand a single bin-location detail record into one StockLevel per article.
 */
export function transformStockLevelsFromBinLocation(raw: RawPickwareBinLocation): StockLevel[] {
  const binId = String(raw.id)
  return (raw.articleDetailBinLocationMappings ?? []).map((m) => {
    const productId = String(m.articleDetailId)
    return {
      id: `${productId}:${binId}`,
      productId,
      locationId: binId,
      quantityOnHand: m.stock ?? 0,
      quantityCommitted: m.reservedStock,
      lastCountedAt: toIso(m.lastStockTake ?? undefined),
      platform: 'pickware',
      metadata: strMap({
        defaultMapping: m.defaultMapping,
        warehouseId: raw.warehouseId,
        binCode: raw.code,
      }),
      raw: m,
    }
  })
}

/**
 * Single-article convenience transform used when iterating bin-location
 * mappings in a flat list context (articleDetailId already extracted).
 */
export function transformStockLevel(raw: RawPickwareBinLocationMapping, binCode?: string, warehouseId?: string | number): StockLevel {
  const productId = String(raw.articleDetailId)
  const binId = String(raw.binLocationId)
  return {
    id: `${productId}:${binId}`,
    productId,
    locationId: binId,
    quantityOnHand: raw.stock ?? 0,
    quantityCommitted: raw.reservedStock,
    lastCountedAt: toIso(raw.lastStockTake ?? undefined),
    platform: 'pickware',
    metadata: strMap({
      defaultMapping: raw.defaultMapping,
      warehouseId,
      binCode,
    }),
    raw,
  }
}
