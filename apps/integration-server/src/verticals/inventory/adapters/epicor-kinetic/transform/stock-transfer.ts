/**
 * Transform Epicor Kinetic Transfer Order (TFOrdHedSvc/TFOrdHeds) → canonical StockTransfer.
 *
 * Epicor Transfer Orders move inventory between warehouses / plants.
 *
 * Key fields (REST v2 TFOrdHedSvc):
 *   TFLineNum      — internal transfer order number (primary key)
 *   FromWarehouseCode — source warehouse
 *   ToWarehouseCode   — destination warehouse
 *   TFOrdNum       — human-readable order number
 *   OpenOrder      — boolean; false = completed / closed
 *   RequestDate    — requested ship / transfer date
 *   NeedByDate     — needed-by date
 *   SysRowID       — stable GUID row identifier
 *
 * Lines come from TFOrdDtlSvc/TFOrdDtls (optional _lines attachment):
 *   TFLineNum, TFOrdLine — composite key
 *   PartNum              — product key
 *   OurStockQty          — quantity ordered
 *   ReceivedQty          — quantity received
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawEpicorKineticTFOrdDtl {
  TFLineNum: number
  TFOrdLine: number
  PartNum: string
  OurStockQty?: number
  ReceivedQty?: number
  [key: string]: unknown
}

export interface RawEpicorKineticTFOrdHed {
  TFOrdNum: string
  FromWarehouseCode?: string
  ToWarehouseCode?: string
  OpenOrder?: boolean
  RequestDate?: string
  NeedByDate?: string
  SysRowID?: string
  /** Pre-fetched transfer order lines. */
  _lines?: RawEpicorKineticTFOrdDtl[]
  [key: string]: unknown
}

function mapStatus(openOrder: boolean | undefined): StockTransferStatus {
  return (openOrder ?? true) ? 'in_transit' : 'completed'
}

export function transformStockTransfer(raw: RawEpicorKineticTFOrdHed): StockTransfer {
  return {
    id:             raw.TFOrdNum,
    externalId:     raw.SysRowID ?? raw.TFOrdNum,
    number:         pickStr(raw.TFOrdNum),
    fromLocationId: raw.FromWarehouseCode ?? '',
    toLocationId:   raw.ToWarehouseCode ?? '',
    status:         mapStatus(raw.OpenOrder),
    lines:          (raw._lines ?? []).map((l) => ({
      productId:        l.PartNum,
      quantity:         l.OurStockQty ?? 0,
      quantityReceived: l.ReceivedQty,
    })),
    shippedAt:      toIso(raw.RequestDate),
    receivedAt:     raw.OpenOrder === false ? toIso(raw.NeedByDate) : undefined,
    platform:       'epicor-kinetic',
    metadata:       strMap({ openOrder: raw.OpenOrder }),
    raw,
  }
}
