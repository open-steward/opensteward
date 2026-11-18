import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw shape returned by GET /PurchaseOrders in Agiliron API v4.0.
 *
 * Status values per UI docs: Created, Ordered, Shipped, Received, Invoiced,
 * Paid, Completed.
 *
 * Response envelope:
 *   { PurchaseOrders: { PurchaseOrder: RawAgilironPurchaseOrder[] }, TotalRecords, ... }
 *
 * Field reference: https://learn.agiliron.com/docs/purchase-order-form-fields
 */
export interface RawAgilironPurchaseOrder {
  PurchaseOrderId?: string
  OrderNo?: string
  Subject?: string
  VendorName?: string
  VendorId?: string
  Status?: string
  DueDate?: string
  OrderDate?: string
  DateReceived?: string
  DeliverTo?: string
  SubTotal?: number | string
  GrandTotal?: number | string
  ShippingCost?: number | string
  Currency?: string
  OrderDetails?: Array<{
    ProductCode?: string
    ProductName?: string
    ProductQty?: number | string
    UnitCost?: number | string
    VendorPrice?: number | string
    ProductTotal?: number | string
    LineItemLocation?: string
    LineItemStatus?: string
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'CREATED': return 'draft'
    case 'ORDERED': return 'sent'
    case 'SHIPPED': return 'sent'
    case 'RECEIVED': return 'received'
    case 'INVOICED': case 'PAID': return 'closed'
    case 'COMPLETED': return 'closed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawAgilironPurchaseOrder): PurchaseOrder {
  const id = pickStr(raw.PurchaseOrderId) ?? pickStr(raw.OrderNo) ?? ''

  return {
    id,
    externalId: id,
    number: pickStr(raw.OrderNo) ?? pickStr(raw.Subject),
    supplierId: pickStr(raw.VendorId) ?? pickStr(raw.VendorName) ?? '',
    destinationLocationId: pickStr(raw.DeliverTo),
    status: mapStatus(raw.Status),
    currency: pickStr(raw.Currency),
    subtotalAmount: pickNum(raw.SubTotal),
    totalAmount: pickNum(raw.GrandTotal),
    lines: (raw.OrderDetails ?? []).map((l) => ({
      productId: pickStr(l.ProductCode) ?? pickStr(l.ProductName) ?? '',
      quantityOrdered: pickNum(l.ProductQty) ?? 0,
      unitCost: pickNum(l.VendorPrice ?? l.UnitCost),
      lineTotal: pickNum(l.ProductTotal),
    })),
    expectedAt: toIso(raw.DueDate),
    orderedAt: toIso(raw.OrderDate),
    receivedAt: toIso(raw.DateReceived),
    platform: 'agiliron',
    metadata: strMap({ subject: raw.Subject, shippingCost: raw.ShippingCost }),
    raw,
  }
}

/** Agiliron GET /PurchaseOrders response envelope */
export interface AgilironPurchaseOrderEnvelope {
  PurchaseOrders?: { PurchaseOrder?: RawAgilironPurchaseOrder[] }
  TotalRecords?: number
  CurrentPage?: number
  TotalPages?: number
  PageSize?: number
}
