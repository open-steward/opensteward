/**
 * Transform a Qoblex adjustment into canonical StockAdjustment.
 *
 * Source: GET /v1/adjustments and GET /v1/adjustments/{id}
 * Schema: Qoblex.Api.Adjustments.Dtos.AdjustmentDetailsDto
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickNum, strMap, toIso} from './shared'

export interface RawQoblexAdjustmentLineItem {
  id?: number
  product_variant?: { id?: number; name?: string; sku?: string }
  quantity?: number
  cost?: number
  previous_quantity?: number
  [key: string]: unknown
}

export interface RawQoblexAdjustment {
  id: number
  number?: string
  created_at?: string
  reason?: string
  status?: string
  units?: number
  total?: number
  location?: { id?: number; name?: string }
  line_items?: RawQoblexAdjustmentLineItem[]
  comments?: string
  author_id?: number
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('stocktake') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('error')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawQoblexAdjustment): StockAdjustment {
  const id = String(raw.id)
  const locationId = raw.location?.id !== undefined ? String(raw.location.id) : ''
  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(raw.reason),
    lines: (raw.line_items ?? []).map((l) => {
      const variantId = l.product_variant?.id !== undefined ? String(l.product_variant.id) : ''
      const newQty = pickNum(l.quantity) ?? 0
      const prevQty = pickNum(l.previous_quantity) ?? 0
      return {
        productId: variantId,
        deltaQuantity: newQty - prevQty,
        countedQuantity: newQty,
      }
    }),
    adjustedAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'qoblex',
    metadata: strMap({
      number: raw.number,
      status: raw.status,
      rawReason: raw.reason,
      units: raw.units,
      comments: raw.comments,
    }),
    raw,
  }
}
