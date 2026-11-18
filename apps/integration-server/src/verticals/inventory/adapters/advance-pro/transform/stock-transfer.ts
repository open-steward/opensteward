/**
 * AdvancePro stock transfer transform.
 *
 * GET /api/StockTransfers returns inter-warehouse transfer records.
 *
 * Known response fields:
 *   id, number, fromWarehouseId, toWarehouseId, status,
 *   shipDate, receivedDate, completedDate,
 *   lines[]: { productId, productSku, quantity, received }
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawAdvanceProTransferLine {
  productId?: string | number
  productSku?: string
  quantity?: number | string
  received?: number | string
  quantityReceived?: number | string
}

export interface RawAdvanceProStockTransfer {
  id?: string | number
  number?: string
  transferNumber?: string
  fromWarehouseId?: string | number
  fromLocationId?: string | number
  toWarehouseId?: string | number
  toLocationId?: string | number
  status?: string
  shipDate?: string
  shippedDate?: string
  receivedDate?: string
  completedDate?: string
  lines?: RawAdvanceProTransferLine[]
  items?: RawAdvanceProTransferLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'NEW': case 'PENDING': return 'draft'
    case 'SHIPPED': case 'IN TRANSIT': case 'INTRANSIT': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': case 'CLOSED': return 'completed'
    case 'VOID': case 'VOIDED': case 'CANCELLED': case 'CANCELED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawAdvanceProStockTransfer): StockTransfer {
  const externalId = String(raw.id ?? '')
  const rawLines = raw.lines ?? raw.items ?? []

  return {
    id: externalId,
    externalId,
    number: pickStr(raw.number ?? raw.transferNumber),
    fromLocationId: String(raw.fromWarehouseId ?? raw.fromLocationId ?? ''),
    toLocationId: String(raw.toWarehouseId ?? raw.toLocationId ?? ''),
    status: mapStatus(raw.status),
    lines: rawLines.map((l) => ({
      productId: String(l.productId ?? ''),
      quantity: pickNum(l.quantity) ?? 0,
      quantityReceived: pickNum(l.received ?? l.quantityReceived),
    })),
    shippedAt: toIso(raw.shipDate ?? raw.shippedDate),
    receivedAt: toIso(raw.receivedDate ?? raw.completedDate),
    platform: 'advance-pro',
    metadata: strMap({}),
    raw,
  }
}
