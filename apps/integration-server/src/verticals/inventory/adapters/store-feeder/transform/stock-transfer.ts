/**
 * StoreFeeder stock-transfer transform.
 *
 * NOTE: StoreFeeder's REST API exposes only a write endpoint for transfers
 * (POST /stocklocations/create-transfers). There is no documented GET endpoint
 * that lists historical transfers. This transform is provided for completeness
 * in case StoreFeeder adds a read endpoint in the future; the adapter's
 * listStockTransfers method throws UnsupportedOperationError accordingly.
 *
 * If/when StoreFeeder documents a read endpoint, map these fields:
 *   TransferID, FromStockLocation, ToStockLocation, Status,
 *   Lines[{ ProductID, Quantity, QuantityReceived }],
 *   CreatedDate, CompletedDate
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawStoreFeederStockTransfer {
  TransferID?: number | string
  TransferGUID?: string
  FromStockLocationID?: number
  ToStockLocationID?: number
  FromWarehouseID?: number
  ToWarehouseID?: number
  Status?: string
  Lines?: Array<{ ProductID?: number; SKU?: string; Quantity?: number; QuantityReceived?: number }>
  CreatedDate?: string
  CompletedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': case 'pending': return 'draft'
    case 'in transit': case 'intransit': case 'shipped': return 'in_transit'
    case 'completed': case 'received': case 'complete': return 'completed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawStoreFeederStockTransfer): StockTransfer {
  const id = String(raw.TransferID ?? raw.TransferGUID ?? '')
  const fromLocationId = raw.FromStockLocationID !== undefined
    ? String(raw.FromStockLocationID)
    : raw.FromWarehouseID !== undefined ? String(raw.FromWarehouseID) : ''
  const toLocationId = raw.ToStockLocationID !== undefined
    ? String(raw.ToStockLocationID)
    : raw.ToWarehouseID !== undefined ? String(raw.ToWarehouseID) : ''

  return {
    id,
    externalId: id,
    number: pickStr(String(raw.TransferID ?? '')),
    fromLocationId,
    toLocationId,
    status: mapStatus(raw.Status),
    lines: (raw.Lines ?? []).map((l) => ({
      productId: String(l.ProductID ?? l.SKU ?? ''),
      quantity: l.Quantity ?? 0,
      quantityReceived: l.QuantityReceived,
    })),
    shippedAt: toIso(raw.CreatedDate),
    receivedAt: toIso(raw.CompletedDate),
    platform: 'store-feeder',
    metadata: strMap({}),
    raw,
  }
}
