/**
 * Transform Mabang ERP get-storage-log-data response into StockAdjustment.
 *
 * The storage log captures every inventory in/out movement.
 * We model each individual log record as a single-line stock adjustment.
 *
 * Mabang field notes (get-storage-log-data data[]):
 *   storageId     — unique movement record ID
 *   stockId       — product ID
 *   stockSku      — product SKU
 *   stockName     — product name
 *   quantity      — movement quantity (positive = in, negative = out per ctype)
 *   ctype         — 1=inbound, 2=outbound
 *   warehouseName — warehouse display name
 *   warehouseCode — warehouse code (note: API field is wearhouseCode, typo in docs)
 *   gridCode      — bin/grid location code
 *   timeCreated   — datetime of movement
 *   operName      — operator name
 *   remark        — notes / reason text
 *   ptype         — movement sub-type code
 *   Inventory     — stock on hand after movement (snapshot)
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawMabangStorageLog {
  storageId?: string | number
  stockId?: string | number
  stockSku?: string
  stockName?: string
  quantity?: string | number
  ctype?: string | number          // 1=inbound, 2=outbound
  warehouseName?: string
  warehouseCode?: string
  wearhouseCode?: string           // typo present in Mabang docs
  gridCode?: string
  timeCreated?: string
  operName?: string
  remark?: string
  ptype?: string | number
  Inventory?: string | number      // snapshot balance
  code?: string
  code2?: string
  labelId?: string | number
  [key: string]: unknown
}

function mapReason(remark: string | undefined, ptype: string | number | undefined): StockAdjustmentReason {
  const r = (remark ?? '').toLowerCase()
  const p = String(ptype ?? '').toLowerCase()
  if (r.includes('count') || p.includes('count')) return 'cycle_count'
  if (r.includes('damage') || p.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || p.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir') || p.includes('expir')) return 'expiration'
  if (r.includes('correct') || p.includes('correct')) return 'correction'
  return 'other'
}

export function transformStorageLog(raw: RawMabangStorageLog): StockAdjustment {
  const id = String(raw.storageId ?? '')
  const productId = String(raw.stockId ?? raw.stockSku ?? '')
  const qty = pickNum(raw.quantity) ?? 0
  // Outbound (ctype=2) movements should be expressed as negative deltas
  const delta = String(raw.ctype) === '2' ? -Math.abs(qty) : Math.abs(qty)
  const locationId = pickStr(raw.warehouseCode) ?? pickStr(raw.wearhouseCode) ?? pickStr(raw.warehouseName) ?? ''

  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(pickStr(raw.remark), raw.ptype),
    lines: [{
      productId,
      deltaQuantity: delta,
      countedQuantity: undefined,
      notes: pickStr(raw.remark),
    }],
    adjustedAt: toIso(raw.timeCreated) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.operName),
    platform: 'mabang-erp',
    metadata: strMap({
      stockName: raw.stockName,
      warehouseName: raw.warehouseName,
      gridCode: raw.gridCode,
      ctype: raw.ctype,
      ptype: raw.ptype,
      inventorySnapshot: raw.Inventory,
      code: raw.code,
      code2: raw.code2,
    }),
    raw,
  }
}
