/**
 * Transform a 3PL Central adjustment record (from GET /inventory/adjustments or
 * GET /inventory/adjustments/{id}) into a canonical StockAdjustment.
 *
 * 3PL Central exposes inventory adjustments through webhook events
 * (AdjustmentCreate, AdjustmentConfirm, AdjustmentCancel, AdjustmentUpdate).
 * A read endpoint at /inventory/adjustments exists but is not part of the
 * Singer tap baseline; this transform is used when that endpoint is available.
 *
 * HAL response shape (camelCase):
 *   adjustmentId, statusIdentifier.{name,id},
 *   customerIdentifier, facilityIdentifier,
 *   adjustmentDate, userIdentifier.{name,id},
 *   notes,
 *   lineItems: Array<{ itemIdentifier, adjustmentQty, notes, reason? }>
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

interface AdjustmentLineItem {
  itemIdentifier?: { sku?: string; id?: number }
  adjustmentQty?: number
  onHandQty?: number
  notes?: string
  reason?: string
  reasonIdentifier?: { name?: string; id?: number }
  [key: string]: unknown
}

export interface Raw3plCentralAdjustment {
  adjustmentId?: number
  statusIdentifier?: { name?: string; id?: number }
  customerIdentifier?: { externalId?: string; name?: string; id?: number }
  facilityIdentifier?: { name?: string; id?: number }
  adjustmentDate?: string
  userIdentifier?: { name?: string; id?: number }
  notes?: string
  lineItems?: AdjustmentLineItem[]
  _embedded?: { 'http://api.3plCentral.com/rels/adjustments/adjustmentlineitem'?: AdjustmentLineItem[] }
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('stolen')) return 'theft'
  if (r.includes('lost') || r.includes('missing')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('error')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: Raw3plCentralAdjustment): StockAdjustment {
  const id = String(raw.adjustmentId ?? '')
  const facilityId = raw.facilityIdentifier?.id !== undefined
    ? `facility:${raw.facilityIdentifier.id}`
    : ''

  const embedded = raw._embedded?.['http://api.3plCentral.com/rels/adjustments/adjustmentlineitem'] ?? []
  const lines = (raw.lineItems ?? embedded).map((l) => ({
    productId: String(l.itemIdentifier?.id ?? ''),
    deltaQuantity: l.adjustmentQty ?? 0,
    countedQuantity: l.onHandQty,
    notes: pickStr(l.notes),
  }))

  // Reason is taken from the first line item if present, otherwise from top-level notes
  const firstLine = (raw.lineItems ?? embedded)[0]
  const reasonStr = pickStr(firstLine?.reason ?? firstLine?.reasonIdentifier?.name ?? raw.notes)

  return {
    id,
    externalId: id,
    locationId: facilityId,
    reason: mapReason(reasonStr),
    lines,
    adjustedAt: toIso(raw.adjustmentDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.userIdentifier?.name),
    platform: '3plcentral',
    metadata: strMap({
      status: raw.statusIdentifier?.name,
      statusId: raw.statusIdentifier?.id,
      facilityName: raw.facilityIdentifier?.name,
      customerId: raw.customerIdentifier?.id,
      notes: raw.notes,
    }),
    raw,
  }
}
