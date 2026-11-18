import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {strMap, toIso, m2oId, m2oName} from './shared'

/**
 * Fulfil stock.inventory (Inventory Adjustment) record.
 *
 * Represents a physical stock count / adjustment.
 * Lines are in stock.inventory.line with expected_quantity and quantity (counted).
 * State: draft | done | cancelled
 */
export interface RawFulfilInventoryLine {
  id: number
  product?: [number, string] | null
  /** Expected quantity before adjustment */
  expected_quantity?: number | null
  /** Counted / new quantity */
  quantity?: number | null
  [key: string]: unknown
}

export interface RawFulfilStockAdjustment {
  /** Integer record id */
  id: number
  /** Location (Many2One) */
  location?: [number, string] | null
  /** State: draft | done | cancelled */
  state?: string | null
  /** Date of the inventory count */
  date?: string | null
  /** Responsible employee (Many2One) */
  employee?: [number, string] | null
  /** Lines (array of ids or objects) */
  lines?: number[] | RawFulfilInventoryLine[]
  create_date?: string | null
  write_date?: string | null
  [key: string]: unknown
}

/** Fields to request from the API for stock.inventory. */
export const STOCK_ADJUSTMENT_FIELDS = [
  'id', 'location', 'state', 'date', 'employee', 'lines', 'create_date', 'write_date',
]

function mapReason(_s: string | null | undefined): StockAdjustmentReason {
  // Fulfil does not store a reason on the inventory record itself; default to cycle_count
  // since stock.inventory represents a physical count.
  return 'cycle_count'
}

export function transformStockAdjustment(
  raw: RawFulfilStockAdjustment,
  lines?: RawFulfilInventoryLine[],
): StockAdjustment {
  const id = String(raw.id)

  const resolvedLines = lines ?? (
    Array.isArray(raw.lines) && raw.lines.length > 0 && typeof raw.lines[0] === 'object'
      ? (raw.lines as RawFulfilInventoryLine[])
      : []
  )

  return {
    id,
    externalId: id,
    locationId: m2oId(raw.location) ?? '',
    reason: mapReason(raw.state),
    lines: resolvedLines.map((l) => ({
      productId: m2oId(l.product) ?? '',
      // delta = counted - expected
      deltaQuantity: (l.quantity ?? 0) - (l.expected_quantity ?? 0),
      countedQuantity: l.quantity ?? undefined,
    })),
    adjustedAt: toIso(raw.date) ?? new Date(0).toISOString(),
    adjustedBy: m2oName(raw.employee),
    platform: 'fulfil-io',
    metadata: strMap({
      locationName: m2oName(raw.location),
      state: raw.state,
    }),
    raw,
  }
}
