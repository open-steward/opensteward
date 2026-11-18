/**
 * Transform Sage X3 INVADJ (Inventory Adjustment) representation to
 * canonical StockAdjustment.
 *
 * INVADJ covers miscellaneous stock count and adjustment entries.
 *
 * Key fields:
 *   VCRNUM  — adjustment voucher number (primary key)
 *   STOFCY  — storage site (warehouse)
 *   VCRDAT  — voucher / adjustment date
 *   VCRSTA  — status: '1'=Draft, '2'=Posted/Validated, '9'=Cancelled
 *   ADJREA  — adjustment reason code
 *   USRNAM  — user who created the adjustment
 *
 * Lines (INVADJ sub-table INVADJ_L or INVADJ_ITMREF parallel arrays):
 *   ITMREF  — product reference
 *   ADJQTY  — delta quantity (positive = increase, negative = decrease)
 *   CNTQTY  — counted / new quantity
 *   ITMDES  — item description / notes
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawSageX3StockAdjustmentLine {
  ITMREF?: string
  ADJQTY?: number | string
  CNTQTY?: number | string
  ITMDES?: string
  [key: string]: unknown
}

export interface RawSageX3StockAdjustment {
  /** Voucher number — primary key */
  VCRNUM?: string
  /** Storage site */
  STOFCY?: string
  /** Voucher date */
  VCRDAT?: string
  /** Status: '1'=Draft, '2'=Posted, '9'=Cancelled */
  VCRSTA?: string | number
  /** Adjustment reason code */
  ADJREA?: string
  /** User who created the adjustment */
  USRNAM?: string
  /** Lines as object array */
  INVADJ_L?: RawSageX3StockAdjustmentLine[]
  /** Parallel arrays form */
  INVADJ_ITMREF?: string[]
  INVADJ_ADJQTY?: Array<number | string>
  INVADJ_CNTQTY?: Array<number | string>
  INVADJ_ITMDES?: string[]
  [key: string]: unknown
}

function mapReason(adjrea: string | undefined): StockAdjustmentReason {
  const r = (adjrea ?? '').toLowerCase()
  if (r.includes('count') || r.includes('invcount') || r.includes('inv')) return 'cycle_count'
  if (r.includes('damage') || r.includes('dmg')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir') || r.includes('obs')) return 'expiration'
  if (r.includes('correct') || r.includes('adj')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawSageX3StockAdjustment): StockAdjustment {
  const id = pickStr(raw.VCRNUM) ?? ''

  let lines: StockAdjustment['lines'] = []
  if (Array.isArray(raw.INVADJ_L) && raw.INVADJ_L.length > 0) {
    lines = raw.INVADJ_L.map((l) => ({
      productId: pickStr(l.ITMREF) ?? '',
      deltaQuantity: pickNum(l.ADJQTY) ?? 0,
      countedQuantity: pickNum(l.CNTQTY),
      notes: pickStr(l.ITMDES),
    }))
  } else if (Array.isArray(raw.INVADJ_ITMREF)) {
    lines = raw.INVADJ_ITMREF.map((itmref, i) => ({
      productId: pickStr(itmref) ?? '',
      deltaQuantity: pickNum(raw.INVADJ_ADJQTY?.[i]) ?? 0,
      countedQuantity: pickNum(raw.INVADJ_CNTQTY?.[i]),
      notes: pickStr(raw.INVADJ_ITMDES?.[i]),
    }))
  }

  return {
    id,
    externalId: id,
    locationId: pickStr(raw.STOFCY) ?? '',
    reason: mapReason(raw.ADJREA),
    lines,
    adjustedAt: toIso(raw.VCRDAT) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.USRNAM),
    platform: 'sage-x3-inventory',
    metadata: strMap({
      vcrsta: raw.VCRSTA,
      adjrea: raw.ADJREA,
      stofcy: raw.STOFCY,
    }),
    raw,
  }
}
