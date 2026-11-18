/**
 * Transform a Vend POS (Lightspeed Retail X-Series) inventory count
 * (STOCKTAKE consignment) into the OpenSteward canonical StockAdjustment schema.
 *
 * In Vend v2.0 there is no dedicated /stock-adjustments endpoint.  Manual
 * inventory adjustments are modelled as consignments with type = "STOCKTAKE".
 * API reference: GET /api/2.0/consignments?type=STOCKTAKE
 *
 * Key consignment fields:
 *   id, outlet_id, status, name, due_at, created_at, updated_at
 *
 * Line items are fetched via:
 *   GET /api/2.0/consignments/{id}/products
 *   → { product_id, count (expected/ordered), received (counted), cost }
 *
 * status values for STOCKTAKE:
 *   STOCKTAKE_SCHEDULED, STOCKTAKE_IN_PROGRESS,
 *   STOCKTAKE_IN_PROGRESS_PROCESSED, STOCKTAKE_COMPLETE, CANCELLED
 */
import type { StockAdjustment } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawVendStockAdjustmentLine {
  product_id: string
  /** Expected/ordered count for stocktake */
  count?: number
  /** Counted (actual) quantity */
  received?: number
  notes?: string
  [key: string]: unknown
}

export interface RawVendStockAdjustment {
  /** UUID */
  id: string
  /** UUID of the outlet where the count was performed */
  outlet_id?: string
  /** Consignment type — always "STOCKTAKE" for stock adjustments */
  type?: string
  /** Human-readable name / label */
  name?: string
  /**
   * Consignment status.
   * STOCKTAKE_SCHEDULED | STOCKTAKE_IN_PROGRESS |
   * STOCKTAKE_IN_PROGRESS_PROCESSED | STOCKTAKE_COMPLETE | CANCELLED
   */
  status?: string
  due_at?: string
  created_at?: string
  updated_at?: string
  /** Line items (populated by the adapter when fetching a single record) */
  consignment_products?: RawVendStockAdjustmentLine[]
  [key: string]: unknown
}

export function transformStockAdjustment(raw: RawVendStockAdjustment): StockAdjustment {
  return {
    id: raw.id,
    externalId: raw.id,
    locationId: pickStr(raw.outlet_id) ?? '',
    // STOCKTAKE consignments always represent a cycle count / inventory count.
    reason: 'cycle_count',
    lines: (raw.consignment_products ?? []).map((l) => ({
      productId: l.product_id,
      // For a stocktake, received = the physically counted quantity.
      // deltaQuantity is not available at the consignment level; use 0 as
      // a safe sentinel — callers that need the delta should compare against
      // current stock levels.
      deltaQuantity: 0,
      countedQuantity: l.received,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.updated_at) ?? toIso(raw.due_at) ?? new Date(0).toISOString(),
    platform: 'vend-pos',
    metadata: strMap({ status: raw.status, name: raw.name }),
    raw,
  }
}
