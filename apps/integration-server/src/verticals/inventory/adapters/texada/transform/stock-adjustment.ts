/**
 * Transform Texada CloudLink inventory adjustment records into the
 * canonical StockAdjustment schema.
 *
 * Texada records adjustments when equipment counts change due to
 * cycle counts, damage write-offs, or corrections.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawTexadaStockAdjustment {
  /** Adjustment internal identifier */
  adjustmentId?: string
  id?: string
  /** Branch where the adjustment occurred */
  branchId?: string
  branchNo?: string
  locationId?: string
  /** Reason / adjustment type */
  reason?: string
  adjustmentType?: string
  adjustmentReason?: string
  /** Status */
  status?: string
  /** Line items */
  lines?: Array<{
    itemNo?: string
    productId?: string
    /** Signed quantity change (positive = gain, negative = loss) */
    quantityChange?: number
    delta?: number
    adjustment?: number
    /** Physical count recorded */
    countedQuantity?: number
    counted?: number
    notes?: string
    comment?: string
  }>
  /** Date adjustment was posted */
  adjustmentDate?: string
  postedDate?: string
  date?: string
  /** Operator who made the adjustment */
  operatorId?: string
  operatorName?: string
  adjustedBy?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || r.includes('write') || r.includes('writeoff')) return 'damage'
  if (r.includes('theft') || r.includes('steal') || r.includes('stolen')) return 'theft'
  if (r.includes('lost') || r.includes('miss')) return 'lost'
  if (r.includes('found') || r.includes('recover')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('error') || r.includes('adj')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawTexadaStockAdjustment): StockAdjustment {
  const id = pickStr(raw.adjustmentId ?? raw.id) ?? ''
  const locationId = pickStr(raw.branchId ?? raw.branchNo ?? raw.locationId) ?? ''
  const reasonStr = raw.reason ?? raw.adjustmentType ?? raw.adjustmentReason
  const reason = mapReason(reasonStr)

  const lines = (raw.lines ?? []).map((l) => ({
    productId: pickStr(l.itemNo ?? l.productId) ?? '',
    deltaQuantity: pickNum(l.quantityChange ?? l.delta ?? l.adjustment) ?? 0,
    countedQuantity: pickNum(l.countedQuantity ?? l.counted),
    notes: pickStr(l.notes ?? l.comment),
  }))

  const adjustedAt = toIso(raw.adjustmentDate ?? raw.postedDate ?? raw.date) ?? new Date(0).toISOString()
  const adjustedBy = pickStr(raw.operatorName ?? raw.adjustedBy ?? raw.operatorId)

  return {
    id,
    externalId: id,
    locationId,
    reason,
    lines,
    adjustedAt,
    adjustedBy,
    platform: 'texada',
    metadata: strMap({ rawReason: reasonStr, status: raw.status }),
    raw,
  }
}
