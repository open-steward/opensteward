/**
 * Transform ECCANG stock transfer (调拨单) records to the canonical StockTransfer schema.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawEccangStockTransferLine {
  goods_id?: string | number
  sku_id?: string | number
  transfer_qty?: number | string
  received_qty?: number | string
  [key: string]: unknown
}

export interface RawEccangStockTransfer {
  transfer_order_id?: string | number
  transfer_order_no?: string
  from_warehouse_id?: string | number
  from_warehouse_code?: string
  to_warehouse_id?: string | number
  to_warehouse_code?: string
  status?: string | number
  ship_time?: string
  finish_time?: string
  items?: RawEccangStockTransferLine[]
  [key: string]: unknown
}

function mapStatus(s: string | number | undefined): StockTransferStatus {
  const v = String(s ?? '').toLowerCase()
  if (v === 'draft' || v === '0') return 'draft'
  if (v === 'in_transit' || v === 'shipped' || v === '1' || v.includes('transit')) return 'in_transit'
  if (v === 'completed' || v === 'received' || v === '2') return 'completed'
  if (v === 'cancelled' || v === 'voided' || v === '3') return 'cancelled'
  return 'draft'
}

export function transformStockTransfer(raw: RawEccangStockTransfer): StockTransfer {
  const id = String(raw.transfer_order_id ?? '')
  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_order_no),
    fromLocationId: raw.from_warehouse_id ? String(raw.from_warehouse_id) : pickStr(raw.from_warehouse_code) ?? '',
    toLocationId: raw.to_warehouse_id ? String(raw.to_warehouse_id) : pickStr(raw.to_warehouse_code) ?? '',
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.sku_id ?? l.goods_id ?? ''),
      quantity: pickNum(l.transfer_qty) ?? 0,
      quantityReceived: pickNum(l.received_qty),
    })),
    shippedAt: toIso(raw.ship_time),
    receivedAt: toIso(raw.finish_time),
    platform: 'eccang',
    metadata: strMap({
      fromWarehouseCode: raw.from_warehouse_code,
      toWarehouseCode: raw.to_warehouse_code,
    }),
    raw,
  }
}
