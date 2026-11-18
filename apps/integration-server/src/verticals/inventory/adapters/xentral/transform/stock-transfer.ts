/**
 * Xentral ERP stock-transfer transform.
 *
 * Xentral's public V1 REST API does not expose a stock-transfer listing
 * endpoint. Inter-warehouse movements (Umlagerungen) are managed through the
 * ERP UI and are not accessible via a public REST endpoint.
 * This file is a placeholder for future use. The adapter does NOT implement
 * listStockTransfers / getStockTransfer.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawXentralStockTransfer {
  id: number | string
  number?: string
  fromWarehouseId?: number | string
  toWarehouseId?: number | string
  status?: string
  shippedAt?: string
  receivedAt?: string
  lines?: Array<{
    productId: number | string
    quantity: number
    quantityReceived?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
    case 'entwurf':
      return 'draft'
    case 'in_transit':
    case 'in transit':
    case 'shipped':
    case 'versandt':
      return 'in_transit'
    case 'completed':
    case 'received':
    case 'abgeschlossen':
      return 'completed'
    case 'cancelled':
    case 'canceled':
    case 'storniert':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawXentralStockTransfer): StockTransfer {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.number),
    fromLocationId: raw.fromWarehouseId != null ? String(raw.fromWarehouseId) : '',
    toLocationId: raw.toWarehouseId != null ? String(raw.toWarehouseId) : '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.productId),
      quantity: l.quantity,
      quantityReceived: l.quantityReceived,
    })),
    shippedAt: toIso(raw.shippedAt),
    receivedAt: toIso(raw.receivedAt),
    platform: 'xentral',
    metadata: strMap({}),
    raw,
  }
}
