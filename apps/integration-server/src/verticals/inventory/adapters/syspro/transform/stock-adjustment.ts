/**
 * Transform SYSPRO InvMovements OData entity → canonical StockAdjustment.
 *
 * SYSPRO records all inventory movements in the InvMovements table.
 * This transform filters to adjustment-type movements and maps them.
 *
 * Confirmed field names from SYSPRO 8 Inventory Query docs:
 *   EntryDate, MovementType, Warehouse, StockCode, MovementQty,
 *   UnitCost, Reference, Operator, Lot, SerialNumber,
 *   TransactionDate, SourceJournal
 *
 * MovementType codes relevant to adjustments (from SYSPRO docs):
 *   'ADJ' = stock adjustment, 'CNT' = stock count/take,
 *   'RCT' = goods received, 'ISS' = issue, 'TRF' = transfer
 *   The adapter surfaces all non-transfer movements as adjustments.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSysproStockAdjustment {
  /** Auto-generated journal number */
  Journal?: string | number
  EntryDate?: string
  TransactionDate?: string
  /** Warehouse code */
  Warehouse?: string
  StockCode?: string
  /** Positive = incoming, negative = outgoing */
  MovementQty?: number
  MovementType?: string
  Reference?: string
  Operator?: string
  Lot?: string
  SourceJournal?: string
  [key: string]: unknown
}

function mapReason(movementType: string | undefined): StockAdjustmentReason {
  const t = (movementType ?? '').toUpperCase()
  if (t === 'CNT') return 'cycle_count'
  if (t === 'ADJ') return 'correction'
  if (t === 'SCR') return 'damage'   // scrap
  return 'other'
}

export function transformStockAdjustment(raw: RawSysproStockAdjustment): StockAdjustment {
  const id = String(raw.Journal ?? `${raw.EntryDate}:${raw.StockCode}:${raw.Warehouse}`)

  return {
    id,
    externalId: id,
    locationId: raw.Warehouse ?? '',
    reason: mapReason(raw.MovementType),
    lines: raw.StockCode
      ? [
          {
            productId:      raw.StockCode,
            deltaQuantity:  raw.MovementQty ?? 0,
            countedQuantity: undefined,
            notes:          pickStr(raw.Reference),
          },
        ]
      : [],
    adjustedAt: toIso(raw.TransactionDate ?? raw.EntryDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.Operator),
    platform: 'syspro',
    metadata: strMap({
      movementType:  raw.MovementType,
      reference:     raw.Reference,
      sourceJournal: raw.SourceJournal,
      lot:           raw.Lot,
    }),
    raw,
  }
}
