/**
 * Transform a VARIO Cloud ArticleStock record into the canonical StockLevel
 * schema.
 *
 * VARIO endpoints:
 *   GET /erp/articles/{id}/stocks            → aggregated per article
 *   GET /erp/articles/{id}/storages/{sid}/stocks → per storage
 *
 * Field mapping:
 *   articleId (from context)  → productId
 *   storageId (from context)  → locationId
 *   quantityInStock           → quantityOnHand
 *   stockAvailable            → quantityAvailable
 *   reservedQuantity          → quantityCommitted
 *   orderedQuantity           → quantityIncoming
 *   quantityInPicking         → metadata
 *   quantityInFabrication     → metadata
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawVarioArticleStorage {
  /** Injected by caller — VARIO article id */
  _articleId: string
  /** Injected by caller — VARIO storage id */
  _storageId: string
  quantityInStock?: number
  stockAvailable?: number
  /** stockAmount on aggregate endpoint */
  stockAmount?: number
  /** stockAvailable on aggregate endpoint */
  reservedQuantity?: number
  orderedQuantity?: number
  quantityInPicking?: number
  quantityInFabrication?: number
  virtualStockAmount?: number
  virtualStockAvailable?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawVarioArticleStorage): StockLevel {
  const productId = String(raw._articleId)
  const locationId = String(raw._storageId)
  const onHand = raw.quantityInStock ?? raw.stockAmount ?? 0
  const available = raw.stockAvailable ?? raw.virtualStockAvailable

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: onHand,
    quantityAvailable: available,
    quantityCommitted: raw.reservedQuantity,
    quantityIncoming: raw.orderedQuantity,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'vario-software',
    metadata: strMap({
      quantityInPicking: raw.quantityInPicking,
      quantityInFabrication: raw.quantityInFabrication,
      virtualStockAmount: raw.virtualStockAmount,
    }),
    raw,
  }
}
