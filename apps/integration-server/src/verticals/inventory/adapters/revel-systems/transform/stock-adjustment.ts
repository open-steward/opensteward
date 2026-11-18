/**
 * Transform Revel Systems InventoryAdjustment resource → canonical StockAdjustment.
 *
 * Endpoint:  GET /resources/InventoryAdjustment/
 *
 * Revel records inventory adjustments when staff manually correct stock counts.
 * Key fields (snake_case):
 *   id, establishment (FK → location), reason, created_date,
 *   inventory_adjustment_items (nested lines with ingredient FK + quantity_change),
 *   user (FK or display name of the person who made the adjustment)
 *
 * Revel reason strings include: "Damage", "Count", "Theft", "Waste",
 *   "Correction", "Expiration", "Found", etc.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawRevelAdjustmentItem {
  id?: number | string
  /** FK to Ingredient. */
  ingredient?: number | string | null
  /** Delta quantity (positive = add, negative = remove). */
  quantity_change?: number | string | null
  /** Final counted quantity after adjustment. */
  quantity?: number | string | null
  notes?: string | null
  [key: string]: unknown
}

export interface RawRevelInventoryAdjustment {
  /** Auto-increment PK. */
  id: number | string
  /** FK to Establishment (location). */
  establishment?: number | string | null
  /** Human-readable reason string. */
  reason?: string | null
  /** ISO-8601 creation timestamp. */
  created_date?: string
  /** FK or display info for the user who made the adjustment. */
  user?: number | string | null
  /** Nested line items. */
  inventory_adjustment_items?: RawRevelAdjustmentItem[]
  [key: string]: unknown
}

function mapReason(s: string | null | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir') || r.includes('waste')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

function resolveUri(v: number | string | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  const match = /\/(\d+)\/?$/.exec(s)
  return match ? match[1] : s
}

export function transformStockAdjustment(raw: RawRevelInventoryAdjustment): StockAdjustment {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    locationId: resolveUri(raw.establishment),
    reason: mapReason(raw.reason),
    lines: (raw.inventory_adjustment_items ?? []).map((l) => ({
      productId: resolveUri(l.ingredient),
      deltaQuantity: pickNum(l.quantity_change) ?? 0,
      countedQuantity: pickNum(l.quantity),
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.created_date) ?? new Date(0).toISOString(),
    adjustedBy: resolveUri(raw.user) || undefined,
    platform: 'revel-systems',
    metadata: strMap({ rawReason: raw.reason }),
    raw,
  }
}
