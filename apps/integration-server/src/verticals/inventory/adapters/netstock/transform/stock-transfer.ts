/**
 * Netstock stock-transfer transform.
 *
 * Netstock is a demand-forecasting / replenishment planning layer that sits
 * above an ERP. Inter-warehouse stock transfers are executed and tracked
 * entirely within the connected ERP (e.g. NetSuite, SAP, Dynamics), NOT by
 * Netstock itself. Netstock's public REST API exposes no stock-transfer
 * listing or lookup endpoint.
 *
 * This file is a typed placeholder. The adapter does NOT implement
 * listStockTransfers / getStockTransfer.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawNetstockStockTransfer {
  id: number | string
  transferNumber?: string
  fromWarehouseId?: number | string
  toWarehouseId?: number | string
  status?: string
  shippedAt?: string
  receivedAt?: string
  lines?: Array<{
    itemId: number | string
    quantity: number
    receivedQty?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'IN_TRANSIT': case 'SHIPPED': case 'DISPATCHED': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': return 'completed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawNetstockStockTransfer): StockTransfer {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.transferNumber),
    fromLocationId: raw.fromWarehouseId != null ? String(raw.fromWarehouseId) : '',
    toLocationId: raw.toWarehouseId != null ? String(raw.toWarehouseId) : '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      quantity: l.quantity,
      quantityReceived: l.receivedQty,
    })),
    shippedAt: toIso(raw.shippedAt),
    receivedAt: toIso(raw.receivedAt),
    platform: 'netstock',
    metadata: strMap({}),
    raw,
  }
}
