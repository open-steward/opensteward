/**
 * Transform Sage X3 STKCNSSDIM representation to canonical StockLevel.
 *
 * STKCNSSDIM (Stock Consolidation by Dimension) provides stock quantities
 * consolidated per product + site (warehouse).
 *
 * Key fields:
 *   ITMREF  — product reference
 *   STOFCY  — storage site / warehouse code
 *   QTYSTU  — quantity in stock unit (on hand)
 *   QTYPCU  — quantity in packaging unit
 *   SAAFCY  — sales site
 *   PHYSTU  — physical on-hand quantity
 *   REOSLO  — reorder level
 *   REOQUA  — reorder quantity
 *   UPDDAT  — last updated date
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawSageX3StockLevel {
  /** Product reference (SKU) */
  ITMREF?: string
  /** Storage site / warehouse code */
  STOFCY?: string
  /** Quantity on hand in stock unit */
  QTYSTU?: number | string
  /** Physical on-hand quantity */
  PHYSTU?: number | string
  /** Quantity allocated / committed */
  ALLQTY?: number | string
  /** Quantity on order (incoming) */
  ORDQTY?: number | string
  /** Reorder level */
  REOSLO?: number | string
  /** Reorder quantity */
  REOQUA?: number | string
  /** Last updated date */
  UPDDAT?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSageX3StockLevel): StockLevel {
  const productId = pickStr(raw.ITMREF) ?? ''
  const locationId = pickStr(raw.STOFCY) ?? ''

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.QTYSTU) ?? pickNum(raw.PHYSTU) ?? 0,
    quantityAvailable: pickNum(raw.PHYSTU) !== undefined
      ? (pickNum(raw.PHYSTU) ?? 0) - (pickNum(raw.ALLQTY) ?? 0)
      : undefined,
    quantityCommitted: pickNum(raw.ALLQTY),
    quantityIncoming: pickNum(raw.ORDQTY),
    reorderPoint: pickNum(raw.REOSLO),
    reorderQuantity: pickNum(raw.REOQUA),
    lastCountedAt: toIso(raw.UPDDAT),
    platform: 'sage-x3-inventory',
    metadata: strMap({ stofcy: raw.STOFCY }),
    raw,
  }
}
