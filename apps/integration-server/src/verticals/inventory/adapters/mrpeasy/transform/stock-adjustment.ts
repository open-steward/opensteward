import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * MRPeasy v1 does not expose a dedicated stock adjustments endpoint.
 * This transform is provided for forward-compatibility and handles the
 * general shape expected if MRPeasy exposes adjustment data.
 *
 * Stock lot locations or write-off operations may surface as adjustments
 * via custom integrations.
 *
 * Field names follow MRPeasy snake_case conventions.
 */
export interface RawMrpeasyStockAdjustment {
  adjustment_id: number | string
  site_id?: number | string
  reason?: string
  status?: number | string
  items?: Array<{ article_id: number | string; delta: number | string; counted?: number | string; notes?: string }>
  date?: number | string
  user?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

function unixToIso(v: number | string | undefined): string | undefined {
  if (v == null) return undefined
  const n = Number(v)
  if (Number.isNaN(n) || n === 0) return undefined
  return new Date(n * 1000).toISOString()
}

export function transformStockAdjustment(raw: RawMrpeasyStockAdjustment): StockAdjustment {
  const id = String(raw.adjustment_id)
  const adjustedAt =
    unixToIso(raw.date) ?? toIso(raw.date as string | undefined) ?? new Date(0).toISOString()

  return {
    id,
    externalId: id,
    locationId: raw.site_id !== undefined ? String(raw.site_id) : '',
    reason: mapReason(raw.reason),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.article_id),
      deltaQuantity: Number(l.delta),
      countedQuantity: l.counted !== undefined ? Number(l.counted) : undefined,
      notes: l.notes,
    })),
    adjustedAt,
    adjustedBy: pickStr(raw.user),
    platform: 'mrpeasy',
    metadata: strMap({ rawReason: raw.reason }),
    raw,
  }
}
