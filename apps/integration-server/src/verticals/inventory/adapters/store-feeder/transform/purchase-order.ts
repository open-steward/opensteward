/**
 * StoreFeeder purchase-order transform.
 *
 * Source: GET /purchase-orders
 * Response wrapper: { TotalItems, TotalPages, PagingInfo, Data: PurchaseOrderModel[] }
 *
 * Monetary amounts (Subtotal, DeliveryCost, TotalVat, Total) are decimals in
 * display units (e.g. 150.00 GBP). They are surfaced unchanged; no minor-unit
 * conversion is performed at this layer.
 *
 * PurchaseOrderStatus enum values from the API:
 *   Draft | Raised | Sent | Partially Received | Received | Complete | Cancelled
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

interface POSupplier {
  SupplierID?: number
  Name?: string
  [key: string]: unknown
}

interface POWarehouse {
  WarehouseID?: number
  WarehouseName?: string
  [key: string]: unknown
}

interface POLine {
  ProductID?: number
  SKU?: string
  QtyOrdered?: number
  QtyReceived?: number
  SinglePrice?: number
  LineVat?: number
  LineTotal?: number
  DeliveryStatus?: string
  DateReceived?: string
  LineNotes?: string
  [key: string]: unknown
}

export interface RawStoreFeederPurchaseOrder {
  PurchaseOrderID?: number
  PurchaseOrderGuid?: string
  PurchaseOrderReference?: string
  PaymentReference?: string
  DateRaised?: string
  DateSent?: string
  DateDue?: string
  UpdatedDate?: string
  Supplier?: POSupplier
  Warehouse?: POWarehouse
  Subtotal?: number
  DeliveryCost?: number
  TotalVat?: number
  Total?: number
  Currency?: { CurrencyCode?: string }
  PurchaseOrderStatus?: string
  Note?: string
  PurchaseOrderLines?: POLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'raised': return 'draft'
    case 'sent': return 'sent'
    case 'partially received': return 'partially_received'
    case 'received': return 'received'
    case 'complete': case 'completed': case 'closed': return 'closed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawStoreFeederPurchaseOrder): PurchaseOrder {
  const id = String(raw.PurchaseOrderID ?? raw.PurchaseOrderGuid ?? '')
  const currency = pickStr(raw.Currency?.CurrencyCode) ?? 'GBP'

  return {
    id,
    externalId: id,
    number: pickStr(raw.PurchaseOrderReference),
    supplierId: raw.Supplier?.SupplierID !== undefined ? String(raw.Supplier.SupplierID) : '',
    destinationLocationId: raw.Warehouse?.WarehouseID !== undefined
      ? String(raw.Warehouse.WarehouseID)
      : undefined,
    status: mapStatus(raw.PurchaseOrderStatus),
    currency,
    subtotalAmount: raw.Subtotal,
    totalAmount: raw.Total,
    lines: (raw.PurchaseOrderLines ?? []).map((l) => ({
      productId: String(l.ProductID ?? l.SKU ?? ''),
      quantityOrdered: l.QtyOrdered ?? 0,
      quantityReceived: l.QtyReceived,
      unitCost: l.SinglePrice,
      lineTotal: l.LineTotal,
    })),
    expectedAt: toIso(raw.DateDue),
    orderedAt: toIso(raw.DateRaised),
    receivedAt: undefined,
    platform: 'store-feeder',
    metadata: strMap({
      paymentReference: raw.PaymentReference,
      dateSent: raw.DateSent,
      deliveryCost: raw.DeliveryCost,
      totalVat: raw.TotalVat,
      note: raw.Note,
    }),
    raw,
  }
}
