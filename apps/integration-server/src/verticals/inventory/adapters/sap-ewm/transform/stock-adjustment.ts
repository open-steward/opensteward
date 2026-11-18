/**
 * SAP EWM stock-adjustment transform.
 *
 * Source: SAP S/4HANA Physical Inventory OData v2 service.
 *   API name : API_WHSE_PHYSINVTRYITEM_2
 *   Entity set: WhsePhysInventoryItem
 *   Key fields: PhysicalInventoryDocument + FiscalYear + PhysicalInventoryItem
 *
 * Physical inventory items in EWM record the difference between counted stock
 * and book stock — exactly what the StockAdjustment schema captures.
 *
 * Movement type 701/702 = physical inventory posting.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawSapEwmPhysInvItem {
  /** Physical inventory document */
  PhysicalInventoryDocument: string
  /** Fiscal year */
  FiscalYear: string
  /** Physical inventory document item */
  PhysicalInventoryItem: string
  /** EWM warehouse number */
  EWMWarehouse?: string
  /** Storage type */
  EWMStorageType?: string
  /** Storage bin */
  EWMStorageBin?: string
  /** Product / material */
  Product?: string
  /** Batch */
  Batch?: string
  /** Counted quantity */
  CountedQuantityInBaseUnit?: string | number
  /** Book quantity (quantity before adjustment) */
  BookQuantityInBaseUnit?: string | number
  /** Base unit of measure */
  BaseUnit?: string
  /** Difference (counted − book) — can be negative */
  QuantityDifferenceInBaseUnit?: string | number
  /** Cycle count document type */
  PhysicalInventoryType?: string
  /** Posting date as /Date(ms)/ */
  PostingDate?: string
  /** Count date */
  PhysicalInventoryCountDate?: string
  /** User who last changed the document */
  LastChangedByUser?: string
  /** Processing status: A=active, B=counted, C=posted */
  PhysicalInventoryStatus?: string
  /**
   * Document creation timestamp as /Date(ms)/ or ISO string.
   * Used as final fallback for adjustedAt when PostingDate and
   * PhysicalInventoryCountDate are both absent.
   */
  CreatedAt?: string
  [key: string]: unknown
}

function mapReason(type: string | undefined): StockAdjustmentReason {
  const t = (type ?? '').toUpperCase()
  if (t === 'CC' || t === 'CYCLE') return 'cycle_count'
  if (t === 'AI' || t === 'ANNUAL') return 'cycle_count'
  return 'cycle_count'   // all EWM physical inventory postings are count-driven
}

export function transformStockAdjustment(raw: RawSapEwmPhysInvItem): StockAdjustment {
  const docId = `${raw.PhysicalInventoryDocument}:${raw.FiscalYear}:${raw.PhysicalInventoryItem}`
  const locationId = raw.EWMStorageBin
    ? `${raw.EWMWarehouse ?? ''}:${raw.EWMStorageType ?? ''}:${raw.EWMStorageBin}`
    : raw.EWMWarehouse ?? ''

  const counted = pickNum(raw.CountedQuantityInBaseUnit) ?? 0
  const book = pickNum(raw.BookQuantityInBaseUnit) ?? 0
  const delta = pickNum(raw.QuantityDifferenceInBaseUnit) ?? (counted - book)

  return {
    id: docId,
    externalId: docId,
    locationId,
    reason: mapReason(raw.PhysicalInventoryType),
    lines: [
      {
        productId: raw.Product ?? '',
        deltaQuantity: delta,
        countedQuantity: counted,
        notes: raw.Batch ? `Batch: ${raw.Batch}` : undefined,
      },
    ],
    adjustedAt: toIso(raw.PostingDate) ?? toIso(raw.PhysicalInventoryCountDate) ?? toIso(raw.CreatedAt) ?? new Date().toISOString(),
    adjustedBy: pickStr(raw.LastChangedByUser),
    platform: 'sap-ewm',
    metadata: strMap({
      physicalInventoryDocument: raw.PhysicalInventoryDocument,
      fiscalYear: raw.FiscalYear,
      physicalInventoryStatus: raw.PhysicalInventoryStatus,
      physicalInventoryType: raw.PhysicalInventoryType,
      ewmWarehouse: raw.EWMWarehouse,
      ewmStorageType: raw.EWMStorageType,
      ewmStorageBin: raw.EWMStorageBin,
      baseUnit: raw.BaseUnit,
      batch: raw.Batch,
    }),
    raw,
  }
}
