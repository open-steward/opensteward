/**
 * Lightspeed Retail (X-Series) stock adjustment transform.
 *
 * X-Series inventory adjustments are consignments with type=STOCKTAKE.
 * Each product line carries the "counted" amount (absolute, not delta);
 * the delta is computed against previous current_amount by the platform.
 *
 * Custom adjustment reasons are managed by the store and surfaced in the
 * consignment name / reference field.
 *
 * API endpoint: GET /api/2.0/consignments?type=STOCKTAKE
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {strMap, toIso} from './shared'
import type { RawLightspeedConsignment, RawLightspeedConsignmentLine } from './purchase-order'

export type { RawLightspeedConsignment as RawLightspeedStockAdjustment }

function mapReason(name: string | undefined, status: string | undefined): StockAdjustmentReason {
  const r = (name ?? status ?? '').toLowerCase()
  if (r.includes('count') || r.includes('stocktake')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('adjust')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawLightspeedConsignment): StockAdjustment {
  return {
    id: raw.id,
    externalId: raw.id,
    locationId: raw.outlet_id ?? '',
    reason: mapReason(raw.name, raw.status),
    lines: (raw.products ?? [] as RawLightspeedConsignmentLine[]).map((l) => {
      const counted = l.received !== undefined
        ? (typeof l.received === 'number' ? l.received : Number(l.received))
        : (typeof l.count === 'number' ? l.count : Number(l.count ?? 0))
      return {
        productId: l.product_id,
        // X-Series stocktake lines carry counted amounts; delta unknown here
        deltaQuantity: 0,
        countedQuantity: counted,
        notes: undefined,
      }
    }),
    adjustedAt: toIso(raw.received_at ?? raw.consignment_date) ?? new Date(0).toISOString(),
    adjustedBy: undefined, // not in consignment response
    platform: 'lightspeed-inventory',
    metadata: strMap({
      name: raw.name,
      reference: raw.reference,
      status: raw.status,
    }),
    raw,
  }
}
