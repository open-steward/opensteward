/**
 * Transform Ongoing WMS inventoryAdjustment response → canonical StockAdjustment.
 *
 * GET /inventoryAdjustments returns a list of articles with their adjustments.
 * Response shape (from Ongoing WMS REST API example responses):
 *
 *   [
 *     {
 *       "article": { "articleSystemId": 18068, "articleNumber": "...", ... },
 *       "inventoryAdjustments": [
 *         {
 *           "inventoryId": 107,
 *           "numberOfItems": -2.0,
 *           "inventoryTime": "2019-10-10T09:19:41.597Z",
 *           "inventoryItemComment": "Dropped on floor",
 *           "inventoryAdjustmentCause": null,
 *           "location": "A15",
 *           "batchNumber": "",
 *           "serial": "",
 *           ...
 *         }
 *       ]
 *     }
 *   ]
 *
 * We flatten one outer article + one inner adjustment into one StockAdjustment.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

interface ArticleRef {
  articleSystemId?: number
  articleNumber?: string
  articleName?: string
  productCode?: string
}

interface AdjustmentCause {
  code?: string
  name?: string
}

interface AdjustmentEntry {
  inventoryId?: number
  numberOfItems?: number
  inventoryTime?: string
  articleItemComment?: string
  inventoryItemComment?: string
  inventoryAdjustmentCause?: AdjustmentCause | null
  location?: string
  batchNumber?: string
  serial?: string
  expiryDate?: string | null
  articleItemStatus?: unknown
}

export interface RawOngoingWmsInventoryAdjustment {
  article?: ArticleRef
  /** Single adjustment entry — callers must flatten the array */
  adjustment?: AdjustmentEntry
  [key: string]: unknown
}

function mapReason(cause: AdjustmentCause | null | undefined, comment: string | undefined): StockAdjustmentReason {
  const text = ((cause?.name ?? cause?.code ?? comment) ?? '').toLowerCase()
  if (text.includes('count') || text.includes('invent')) return 'cycle_count'
  if (text.includes('damage')) return 'damage'
  if (text.includes('theft') || text.includes('steal')) return 'theft'
  if (text.includes('lost')) return 'lost'
  if (text.includes('found')) return 'found'
  if (text.includes('expir')) return 'expiration'
  if (text.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawOngoingWmsInventoryAdjustment): StockAdjustment {
  const adj = raw.adjustment ?? {}
  const art = raw.article ?? {}
  const id = String(adj.inventoryId ?? '')
  const articleId = String(art.articleSystemId ?? art.articleNumber ?? '')
  const comment = pickStr(adj.inventoryItemComment ?? adj.articleItemComment)

  return {
    id,
    externalId: id,
    locationId: pickStr(adj.location) ?? '',
    reason: mapReason(adj.inventoryAdjustmentCause, comment),
    lines: [
      {
        productId: articleId,
        deltaQuantity: adj.numberOfItems ?? 0,
        countedQuantity: undefined,
        notes: comment,
      },
    ],
    adjustedAt: toIso(adj.inventoryTime) ?? new Date(0).toISOString(),
    adjustedBy: undefined,
    platform: 'ongoing-wms',
    metadata: strMap({
      batchNumber: adj.batchNumber,
      serial: adj.serial,
      adjustmentCauseCode: adj.inventoryAdjustmentCause?.code,
      adjustmentCauseName: adj.inventoryAdjustmentCause?.name,
    }),
    raw,
  }
}
