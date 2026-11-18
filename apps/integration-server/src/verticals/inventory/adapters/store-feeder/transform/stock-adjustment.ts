/**
 * StoreFeeder stock-adjustment transform.
 *
 * Source: GET /products/{productid}/productinventorylogs
 * Each log entry represents one inventory change event for a product.
 *
 * The API does not expose a bulk "list all adjustments" endpoint; the adapter
 * uses inventory log entries as adjustments, keyed by product + log entry ID.
 *
 * Fields documented on the ProductInventoryLog endpoint:
 *   LogID, ProductID, SKU, WarehouseID, QuantityBefore, QuantityAfter,
 *   Delta (computed), Reason / ReasonDescription, UpdatedDate, User
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawStoreFeederInventoryLog {
  LogID?: number | string
  ProductID?: number
  ProductGUID?: string
  SKU?: string
  WarehouseID?: number
  StockLocationID?: number
  QuantityBefore?: number
  QuantityAfter?: number
  /** Pre-computed delta; if absent we derive it. */
  Delta?: number
  Reason?: string
  ReasonDescription?: string
  UpdatedDate?: string
  User?: string
  UserName?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('stocktake')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('amend')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawStoreFeederInventoryLog): StockAdjustment {
  const id = String(raw.LogID ?? '')
  const productId = String(raw.ProductID ?? raw.ProductGUID ?? raw.SKU ?? '')
  const locationId = raw.StockLocationID !== undefined
    ? String(raw.StockLocationID)
    : raw.WarehouseID !== undefined ? String(raw.WarehouseID) : ''

  const delta = raw.Delta !== undefined
    ? raw.Delta
    : (raw.QuantityAfter ?? 0) - (raw.QuantityBefore ?? 0)

  const reasonLabel = pickStr(raw.ReasonDescription) ?? pickStr(raw.Reason)

  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(reasonLabel),
    lines: [
      {
        productId,
        deltaQuantity: delta,
        countedQuantity: raw.QuantityAfter,
        notes: reasonLabel,
      },
    ],
    adjustedAt: toIso(raw.UpdatedDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.User) ?? pickStr(raw.UserName),
    platform: 'store-feeder',
    metadata: strMap({
      rawReason: raw.Reason,
      reasonDescription: raw.ReasonDescription,
      quantityBefore: raw.QuantityBefore,
      quantityAfter: raw.QuantityAfter,
    }),
    raw,
  }
}
