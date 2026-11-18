/**
 * Transform a VARIO Cloud manual stock movement
 * (stockjournal entry with type=MANUAL) into the canonical StockAdjustment
 * schema.
 *
 * Field mapping (per erp-stock-StockJournal schema):
 *   id             ← id
 *   storageBinId   → locationId  (the storage bin that was booked)
 *   articleId      → lines[].productId
 *   factor         → sign of deltaQuantity (INCREMENT positive, DECREMENT negative)
 *   quantity       → lines[].deltaQuantity (signed)
 *   valueDate      → adjustedAt
 *   note           → lines[].notes + metadata
 *   type           → reason (MANUAL → other, INVENTORY → cycle_count, etc.)
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawVarioManualMovement {
  id?: string | number
  articleId?: string | number
  storageBinId?: string | number
  /** INCREMENT | DECREMENT | NONE */
  factor?: string
  quantity?: number
  valueDate?: string
  note?: string
  type?: string
  productNumber?: string
  bookingTypeId?: string
  cancellation?: boolean
  [key: string]: unknown
}

function mapReason(type: string | undefined, note: string | undefined): StockAdjustmentReason {
  const t = (type ?? '').toUpperCase()
  const n = (note ?? '').toLowerCase()
  if (t === 'INVENTORY' || t === 'INITIAL_INVENTORY' || t === 'INVENTORY_CORRECTION') return 'cycle_count'
  if (n.includes('damage') || n.includes('schaden')) return 'damage'
  if (n.includes('theft') || n.includes('diebstahl')) return 'theft'
  if (n.includes('lost') || n.includes('verlust')) return 'lost'
  if (n.includes('found') || n.includes('gefunden')) return 'found'
  if (n.includes('expir') || n.includes('verfal')) return 'expiration'
  if (n.includes('correct') || n.includes('korrek')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawVarioManualMovement): StockAdjustment {
  const id = String(raw.id ?? '')
  const productId = pickStr(raw.articleId) ?? ''
  const locationId = pickStr(raw.storageBinId) ?? ''

  // Signed delta: factor=DECREMENT negates quantity
  const qty = raw.quantity ?? 0
  const delta = (raw.factor ?? '').toUpperCase() === 'DECREMENT' ? -qty : qty

  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(raw.type, raw.note),
    lines: [
      {
        productId,
        deltaQuantity: delta,
        countedQuantity: undefined,
        notes: pickStr(raw.note),
      },
    ],
    adjustedAt: toIso(raw.valueDate) ?? new Date(0).toISOString(),
    adjustedBy: undefined,
    platform: 'vario-software',
    metadata: strMap({ type: raw.type, note: raw.note }),
    raw,
  }
}
