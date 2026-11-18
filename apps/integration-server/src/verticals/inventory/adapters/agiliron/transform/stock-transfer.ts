import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw shape returned by GET /InventoryTransfer in Agiliron API v4.0.
 *
 * The InventoryTransfer endpoint returns an Orders-style envelope:
 *   { Orders: { Order: RawAgilironTransfer[] }, TotalRecords, ... }
 *
 * Field reference: https://api.agiliron.com/docs/read-inventory-transfer-1.md
 */
export interface RawAgilironTransfer {
  OrdersId?: string
  OrderNo?: string
  Subject?: string
  Status?: string
  DeliverFrom?: string
  DeliverTo?: string
  OrderDate?: string
  ModifiedTime?: string
  ModifiedTimeUTC?: string
  ShippingStatus?: string
  Cancelled?: boolean | string | number
  OrderDetails?: Array<{
    ProductCode?: string
    ProductName?: string
    ProductQty?: number | string
    LineItemStatus?: string
  }>
  [key: string]: unknown
}

function mapStatus(raw: RawAgilironTransfer): StockTransferStatus {
  if (raw.Cancelled === true || raw.Cancelled === 1 || raw.Cancelled === '1') return 'cancelled'
  const s = (raw.Status ?? raw.ShippingStatus ?? '').toUpperCase()
  if (s === 'SHIPPED' || s === 'IN TRANSIT') return 'in_transit'
  if (s === 'COMPLETED' || s === 'RECEIVED' || s === 'DELIVERED') return 'completed'
  if (s === 'CANCELLED' || s === 'VOIDED') return 'cancelled'
  if (s === 'DRAFT' || s === 'CREATED') return 'draft'
  return 'draft'
}

export function transformStockTransfer(raw: RawAgilironTransfer): StockTransfer {
  const id = pickStr(raw.OrdersId) ?? pickStr(raw.OrderNo) ?? ''

  return {
    id,
    externalId: id,
    number: pickStr(raw.OrderNo) ?? pickStr(raw.Subject),
    fromLocationId: pickStr(raw.DeliverFrom) ?? '',
    toLocationId: pickStr(raw.DeliverTo) ?? '',
    status: mapStatus(raw),
    lines: (raw.OrderDetails ?? []).map((l) => ({
      productId: pickStr(l.ProductCode) ?? pickStr(l.ProductName) ?? '',
      quantity: pickNum(l.ProductQty) ?? 0,
    })),
    shippedAt: toIso(raw.OrderDate),
    receivedAt: toIso(raw.ModifiedTimeUTC ?? raw.ModifiedTime),
    platform: 'agiliron',
    metadata: strMap({ subject: raw.Subject, shippingStatus: raw.ShippingStatus }),
    raw,
  }
}

/** Agiliron GET /InventoryTransfer response envelope */
export interface AgilironTransferEnvelope {
  Orders?: { Order?: RawAgilironTransfer[] }
  TotalRecords?: number
  CurrentPage?: number
  TotalPages?: number
  PageSize?: number
}
