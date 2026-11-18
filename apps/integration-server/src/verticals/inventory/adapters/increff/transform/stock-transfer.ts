/**
 * Increff stock transfer (warehouse-to-warehouse movement) transform.
 *
 * Increff refers to these as "outward orders" between warehouses, or
 * inter-warehouse transfers. Key fields:
 *   transferCode     — unique transfer identifier
 *   fromWarehouseCode / toWarehouseCode — source and destination
 *   status           — CREATED | IN_TRANSIT | COMPLETED | CANCELLED
 *   items            — line items with skuCode and quantities
 *   shippedOn        — dispatch timestamp
 *   completedOn      — receipt confirmation timestamp
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawIncreffStockTransfer {
  transferCode: string
  fromWarehouseCode?: string
  toWarehouseCode?: string
  status?: string
  items?: Array<{ skuCode: string; quantity: number; receivedQty?: number }>
  shippedOn?: string
  completedOn?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'CREATED': case 'DRAFT': return 'draft'
    case 'IN_TRANSIT': case 'SHIPPED': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': return 'completed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawIncreffStockTransfer): StockTransfer {
  return {
    id: raw.transferCode,
    externalId: raw.transferCode,
    number: pickStr(raw.transferCode),
    fromLocationId: raw.fromWarehouseCode ?? '',
    toLocationId: raw.toWarehouseCode ?? '',
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((l) => ({
      productId: l.skuCode,
      quantity: l.quantity,
      quantityReceived: l.receivedQty,
    })),
    shippedAt: toIso(raw.shippedOn),
    receivedAt: toIso(raw.completedOn),
    platform: 'increff',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
