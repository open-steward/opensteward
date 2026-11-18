/**
 * Transform Extensiv Order Manager stock transfer → canonical StockTransfer.
 *
 * Real API: GET /api/v1/inventory/stocktransfers
 * Key fields: stockTransferOrderId, stockTransferOrderNumber,
 *             fromWarehouseId, toWarehouseId, status, createdDate,
 *             items[]: { productId, masterSku, quantity, status, receivedDate }
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawExtensivStockTransferItem {
  stockTransferOrderItemId?: number | string | null
  productId?: number | string | null
  masterSku?: string | null
  quantity?: number | null
  status?: string | null
  receivedDate?: string | null
  internalNotes?: string | null
  [key: string]: unknown
}

export interface RawExtensivStockTransfer {
  stockTransferOrderId?: number | string | null
  stockTransferOrderNumber?: string | null
  fromWarehouseId?: number | string | null
  toWarehouseId?: number | string | null
  status?: string | null
  createdDate?: string | null
  internalNotes?: string | null
  items?: RawExtensivStockTransferItem[] | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'PENDING': return 'draft'
    case 'IN_TRANSIT': case 'IN TRANSIT': case 'SHIPPED': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': case 'COMPLETE': return 'completed'
    case 'VOIDED': case 'CANCELLED': case 'CANCELED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawExtensivStockTransfer): StockTransfer {
  const id = String(raw.stockTransferOrderId ?? '')

  // Derive receivedAt from the latest item receivedDate
  const receivedDates = (raw.items ?? [])
    .map((item) => toIso(item.receivedDate))
    .filter((d): d is string => d !== undefined)
  const receivedAt = receivedDates.length > 0
    ? receivedDates.reduce((a, b) => (a > b ? a : b))
    : undefined

  return {
    id,
    externalId: id,
    number: pickStr(raw.stockTransferOrderNumber),
    fromLocationId: String(raw.fromWarehouseId ?? ''),
    toLocationId: String(raw.toWarehouseId ?? ''),
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((item) => ({
      productId: String(item.productId ?? ''),
      quantity: item.quantity ?? 0,
    })),
    shippedAt: toIso(raw.createdDate),
    receivedAt,
    platform: 'extensiv-order-manager',
    metadata: strMap({ internalNotes: raw.internalNotes, status: raw.status }),
    raw,
  }
}
