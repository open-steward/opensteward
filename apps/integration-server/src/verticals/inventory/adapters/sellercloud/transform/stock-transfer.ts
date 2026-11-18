/**
 * Transform a Sellercloud Warehouse Inventory Transfer (WITR) record.
 *
 * Source endpoints:
 *   GET /rest/api/WarehouseInventoryTransfers         (list)
 *   GET /rest/api/WarehouseInventoryTransfers/{id}    (single)
 *   GET /rest/api/WarehouseInventoryTransfers/{id}/Products (line items — merged)
 * Docs: https://developer.sellercloud.com/dev-article/get-warehouse-inventory-transfer-by-id/
 *
 * WITR Status codes (integer enum):
 *   0=Pending, 1=Requested, 2=Picked, 3=Shipped, 10=Received, 15=Completed,
 *   20=Cancelled, 88=PartiallyReceived, 99=Void, -1=All
 *
 * Key field mappings:
 *   ID              → id / externalId
 *   Title           → number
 *   Status          → status  (mapped to canonical enum)
 *   FromWarehouseID → fromLocationId
 *   ToWarehouseID   → toLocationId
 *   CreatedOn       → (used via metadata)
 *   ShippedOn       → shippedAt
 *   ReceivedOn      → receivedAt
 *   Products[].ProductID      → lines[].productId
 *   Products[].TransferQty    → lines[].quantity
 *   Products[].TotalReceivedQty → lines[].quantityReceived
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSellercloudWITRProduct {
  ID?: number
  ProductID?: string | number
  ProductName?: string
  TransferQty?: number
  QtyPicked?: number
  TotalReceivedQty?: number
  QtyInFromWarehouse?: number
  QtyInToWarehouse?: number
  [key: string]: unknown
}

export interface RawSellercloudWITR {
  ID: number | string
  Title?: string
  /** Integer status code: 0=Pending,1=Requested,2=Picked,3=Shipped,10=Received,15=Completed,20=Cancelled,99=Void */
  Status?: number
  CompanyID?: number
  FromWarehouseID?: number | string
  InterimWarehouseID?: number | string | null
  ToWarehouseID?: number | string
  Notes?: string
  CreatedOn?: string
  RequestedOn?: string
  ShippedOn?: string
  ReceivedOn?: string
  /** Merged line items from /WarehouseInventoryTransfers/{id}/Products */
  Products?: RawSellercloudWITRProduct[]
  [key: string]: unknown
}

function mapStatus(status: number | undefined): StockTransferStatus {
  switch (status) {
    case 0: case 1: case 2: return 'draft'
    case 3: return 'in_transit'
    case 10: case 15: return 'completed'
    case 20: case 99: return 'cancelled'
    case 88: return 'in_transit' // PartiallyReceived — still in motion
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawSellercloudWITR): StockTransfer {
  const id = String(raw.ID)
  return {
    id,
    externalId: id,
    number: pickStr(raw.Title),
    fromLocationId: raw.FromWarehouseID != null ? String(raw.FromWarehouseID) : '',
    toLocationId: raw.ToWarehouseID != null ? String(raw.ToWarehouseID) : '',
    status: mapStatus(raw.Status),
    lines: (raw.Products ?? []).map((p) => ({
      productId: p.ProductID != null ? String(p.ProductID) : '',
      quantity: p.TransferQty ?? 0,
      quantityReceived: p.TotalReceivedQty,
    })),
    shippedAt: toIso(raw.ShippedOn),
    receivedAt: toIso(raw.ReceivedOn),
    platform: 'sellercloud',
    metadata: strMap({
      status: raw.Status,
      notes: raw.Notes,
      requestedOn: raw.RequestedOn,
    }),
    raw,
  }
}
