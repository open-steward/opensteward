import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickNum, pickStr, strMap, toIso} from './shared'

/**
 * ShipEdge stock transfer record.
 *
 * ShipEdge does not document a public REST endpoint for listing stock
 * transfers. This transform is defined for completeness and to support
 * future private/enterprise API access. The field names follow ShipEdge's
 * snake_case convention observed across the v2/v3 APIs.
 */
export interface RawShipEdgeStockTransfer {
  transfer_id: string | number
  transfer_num?: string
  from_warehouse?: string
  to_warehouse?: string
  status?: string
  items?: Array<{
    sku: string
    qty?: number | string
    qty_received?: number | string
  }>
  ship_date?: string
  completed_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': case 'pending': return 'draft'
    case 'intransit': case 'in_transit': case 'in transit': case 'shipped': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawShipEdgeStockTransfer): StockTransfer {
  const id = String(raw.transfer_id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_num),
    fromLocationId: pickStr(raw.from_warehouse) ?? '',
    toLocationId: pickStr(raw.to_warehouse) ?? '',
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((item) => ({
      productId: item.sku,
      quantity: pickNum(item.qty) ?? 0,
      quantityReceived: pickNum(item.qty_received),
    })),
    shippedAt: toIso(raw.ship_date),
    receivedAt: toIso(raw.completed_date),
    platform: 'shipedge',
    metadata: strMap({}),
    raw,
  }
}
