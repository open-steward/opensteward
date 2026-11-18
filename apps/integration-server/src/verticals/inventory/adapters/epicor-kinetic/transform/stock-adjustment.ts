/**
 * Transform Epicor Kinetic Part Transaction (PartTranSvc/PartTrans) → canonical StockAdjustment.
 *
 * Epicor records every inventory movement as a PartTran. We surface quantity-
 * adjustment transactions (TranType = "ADJ-QTY", "ADJ-CST", "INS-STK", "DMR-MTL",
 * "MFG-STK", etc.) as StockAdjustment records.
 *
 * Key fields (REST v2 PartTranSvc):
 *   SysDate       — transaction date (date portion)
 *   SysTime       — transaction time seconds since midnight
 *   TranNum       — unique transaction number
 *   PartNum       — product key
 *   WareHouseCode — warehouse where adjustment occurred
 *   TranQty       — quantity delta (negative = decrease)
 *   TranType      — Epicor transaction type code
 *   EntryPerson   — who performed the adjustment
 *   SysRowID      — stable GUID row identifier
 *
 * Epicor does not expose a "counted quantity" separately for ad-hoc adjustments;
 * countedQuantity is left undefined unless the TranType implies a cycle-count.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawEpicorKineticPartTran {
  SysDate?: string
  SysTime?: number
  TranNum: number
  PartNum?: string
  WareHouseCode?: string
  TranQty?: number
  TranType?: string
  EntryPerson?: string
  SysRowID?: string
  [key: string]: unknown
}

const CYCLE_COUNT_TYPES = new Set(['ADJ-QTY', 'PIK-INV', 'BRK-INV'])

function mapReason(tranType: string | undefined): StockAdjustmentReason {
  const t = (tranType ?? '').toUpperCase()
  if (CYCLE_COUNT_TYPES.has(t)) return 'cycle_count'
  if (t.includes('DMR') || t.includes('SCRAP')) return 'damage'
  if (t.includes('LOST')) return 'lost'
  if (t.includes('FND') || t.includes('FOUND')) return 'found'
  if (t.includes('EXPIR')) return 'expiration'
  if (t.includes('CORR') || t.includes('ADJ')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawEpicorKineticPartTran): StockAdjustment {
  // Combine SysDate + SysTime (seconds since midnight) into an ISO datetime.
  let adjustedAt: string | undefined
  if (raw.SysDate) {
    if (typeof raw.SysTime === 'number') {
      const base = new Date(raw.SysDate)
      base.setSeconds(raw.SysTime)
      adjustedAt = Number.isNaN(base.getTime()) ? undefined : base.toISOString()
    } else {
      adjustedAt = toIso(raw.SysDate)
    }
  }

  return {
    id:         String(raw.TranNum),
    externalId: raw.SysRowID ?? String(raw.TranNum),
    locationId: raw.WareHouseCode ?? '',
    reason:     mapReason(raw.TranType),
    lines:      raw.PartNum ? [{
      productId:        raw.PartNum,
      deltaQuantity:    raw.TranQty ?? 0,
      countedQuantity:  undefined,
      notes:            pickStr(raw.TranType),
    }] : [],
    adjustedAt:  adjustedAt ?? new Date(0).toISOString(),
    adjustedBy:  pickStr(raw.EntryPerson),
    platform:    'epicor-kinetic',
    metadata:    strMap({ tranType: raw.TranType }),
    raw,
  }
}
