/**
 * Openbravo MaterialMgmtInventoryCount → canonical StockAdjustment.
 *
 * Entity: MaterialMgmtInventoryCount (table: M_Inventory)
 * Endpoint: /openbravo/org.openbravo.service.json.jsonrest/MaterialMgmtInventoryCount
 *
 * Each InventoryCount record is a physical count event. The line-level
 * entity is MaterialMgmtInventoryCountLine which contains the product,
 * storage bin, counted quantity, and book quantity (from which the delta
 * is derived).
 *
 * Status:
 *   DR (Draft) → CO (Processed) → VO (Voided)
 *
 * Fields used (header):
 *   id, documentNo, documentStatus, movementDate, warehouse.id,
 *   name (description of reason), createdBy._identifier
 * Fields used (line):
 *   product.id, storageBin.id, quantityCount (counted), bookQuantity (system),
 *   adjustmentQuantity (delta)
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOpenbravoInventoryCountLine {
  id: string
  product?: { id?: string }
  storageBin?: { id?: string }
  /** Physically counted quantity */
  quantityCount?: number | string
  /** System book quantity before adjustment */
  bookQuantity?: number | string
  /** Explicit adjustment delta (quantityCount - bookQuantity) */
  adjustmentQuantity?: number | string
  description?: string
  [key: string]: unknown
}

export interface RawOpenbravoInventoryCount {
  /** UUID primary key */
  id: string
  documentNo?: string
  /** DR=Draft, CO=Processed, VO=Voided */
  documentStatus?: string
  /** Reason / description text */
  name?: string
  warehouse?: { id?: string }
  movementDate?: string
  /** User who created the record */
  createdBy?: { _identifier?: string }
  materialMgmtInventoryCountLineList?: RawOpenbravoInventoryCountLine[]
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('inventario') || r.includes('physical')) return 'cycle_count'
  if (r.includes('damage') || r.includes('dano')) return 'damage'
  if (r.includes('theft') || r.includes('robo')) return 'theft'
  if (r.includes('lost') || r.includes('perdid')) return 'lost'
  if (r.includes('found') || r.includes('hallad')) return 'found'
  if (r.includes('expir') || r.includes('caducad')) return 'expiration'
  if (r.includes('correct') || r.includes('ajuste')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawOpenbravoInventoryCount): StockAdjustment {
  const locationId = raw.warehouse?.id ?? ''

  return {
    id: raw.id,
    externalId: raw.id,
    locationId,
    reason: mapReason(raw.name),
    lines: (raw.materialMgmtInventoryCountLineList ?? []).map((l) => {
      const counted = pickNum(l.quantityCount)
      const book = pickNum(l.bookQuantity)
      const explicitDelta = pickNum(l.adjustmentQuantity)
      // Delta: use explicit field if present, else compute from count - book
      const deltaQuantity =
        explicitDelta !== undefined
          ? explicitDelta
          : counted !== undefined && book !== undefined
            ? counted - book
            : 0
      return {
        productId: l.product?.id ?? '',
        deltaQuantity,
        countedQuantity: counted,
        notes: pickStr(l.description),
      }
    }),
    adjustedAt: toIso(raw.movementDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.createdBy?._identifier),
    platform: 'openbravo',
    metadata: strMap({
      documentStatus: raw.documentStatus,
      documentNo: raw.documentNo,
      rawReason: raw.name,
    }),
    raw,
  }
}
