import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * EasyEcom stock transfer (inter-warehouse transfer) record.
 * Fields sourced from EasyEcom API /inventory/getStockTransfers response.
 */
export interface RawEasyEcomStockTransfer {
  transfer_id: string | number
  transfer_number?: string
  from_warehouse_id?: string | number
  to_warehouse_id?: string | number
  status?: string
  items?: Array<{
    sku?: string
    product_id?: string | number
    qty_transferred?: number | string
    qty_received?: number | string
  }>
  shipped_date?: string
  received_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  const up = (s ?? '').toUpperCase()
  if (up === 'DRAFT' || up === 'PENDING') return 'draft'
  if (up === 'IN TRANSIT' || up === 'SHIPPED' || up === 'IN-TRANSIT') return 'in_transit'
  if (up === 'COMPLETED' || up === 'RECEIVED') return 'completed'
  if (up === 'CANCELLED' || up === 'VOIDED') return 'cancelled'
  return 'draft'
}

export function transformStockTransfer(raw: RawEasyEcomStockTransfer): StockTransfer {
  const id = String(raw.transfer_id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_number),
    fromLocationId: raw.from_warehouse_id != null ? String(raw.from_warehouse_id) : '',
    toLocationId: raw.to_warehouse_id != null ? String(raw.to_warehouse_id) : '',
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((l) => ({
      productId: l.product_id != null ? String(l.product_id) : (l.sku ?? ''),
      quantity: pickNum(l.qty_transferred) ?? 0,
      quantityReceived: pickNum(l.qty_received),
    })),
    shippedAt: toIso(raw.shipped_date),
    receivedAt: toIso(raw.received_date),
    platform: 'easyecom',
    metadata: strMap({}),
    raw,
  }
}
