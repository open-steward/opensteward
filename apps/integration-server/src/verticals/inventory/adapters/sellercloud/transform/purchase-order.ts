/**
 * Transform a Sellercloud purchase order record.
 *
 * Source endpoints:
 *   GET /rest/api/purchaseorders              (list)
 *   GET /rest/api/PurchaseOrders/{id}/Items   (line items — merged in client)
 * Docs: https://developer.sellercloud.com/dev-article/get-all-purchase-orders/
 *
 * Key field mappings:
 *   ID                    → id / externalId
 *   VendorID              → supplierId
 *   PurchaseOrderStatus   → status  (mapped to canonical enum)
 *   GrandTotal            → totalAmount (integer minor units — cents)
 *   OrderTotal            → totalAmount fallback
 *   CreatedOn             → orderedAt (creation date is the closest proxy)
 *   ExpectedDeliveryDate  → expectedAt
 *   Items[].ProductID     → lines[].productId
 *   Items[].QtyUnitsOrdered → lines[].quantityOrdered
 *   Items[].UnitPrice     → lines[].unitCost (cents)
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {strMap, toIso} from './shared'

export interface RawSellercloudPurchaseOrderItem {
  ID?: number
  ProductID?: string | number
  ProductName?: string
  QtyUnitsOrdered?: number
  QtyUnitsPerCase?: number
  QtyReceived?: number
  UnitPrice?: number
  AdjustedPrice?: number
  LineTotal?: number
  ExpectedDeliveryDate?: string
  [key: string]: unknown
}

export interface RawSellercloudPurchaseOrder {
  ID: number | string
  VendorID?: number | string | null
  CompanyID?: number
  /** "Saved" | "Ordered" | "Received" | "Pending" | "Cancelled" | "Competed" */
  PurchaseOrderStatus?: string
  GrandTotal?: number
  OrderTotal?: number
  TaxTotal?: number
  ShippingTotal?: number
  DiscountTotal?: number
  CreatedOn?: string
  DateOrdered?: string
  ExpectedDeliveryDate?: string
  LastRevisedOn?: string
  /** Merged line items from /PurchaseOrders/{id}/Items */
  Items?: RawSellercloudPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'saved': case 'pending': return 'draft'
    case 'ordered': return 'sent'
    case 'partiallyreceived': case 'partially received': return 'partially_received'
    case 'received': return 'received'
    case 'competed': case 'completed': case 'closed': return 'closed'
    case 'cancelled': case 'canceled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSellercloudPurchaseOrder): PurchaseOrder {
  const id = String(raw.ID)

  // totalAmount in integer minor units (cents)
  const totalDollars = raw.GrandTotal ?? raw.OrderTotal
  const totalAmount = totalDollars !== undefined ? Math.round(totalDollars * 100) : undefined

  return {
    id,
    externalId: id,
    supplierId: raw.VendorID != null ? String(raw.VendorID) : '',
    status: mapStatus(raw.PurchaseOrderStatus),
    totalAmount,
    lines: (raw.Items ?? []).map((l) => ({
      productId: l.ProductID != null ? String(l.ProductID) : '',
      quantityOrdered: l.QtyUnitsOrdered ?? 0,
      quantityReceived: l.QtyReceived,
      // unitCost in integer minor units (cents)
      unitCost:
        l.AdjustedPrice !== undefined
          ? Math.round(l.AdjustedPrice * 100)
          : l.UnitPrice !== undefined
          ? Math.round(l.UnitPrice * 100)
          : undefined,
      lineTotal: l.LineTotal !== undefined ? Math.round(l.LineTotal * 100) : undefined,
    })),
    expectedAt: toIso(raw.ExpectedDeliveryDate),
    orderedAt: toIso(raw.DateOrdered) ?? toIso(raw.CreatedOn),
    platform: 'sellercloud',
    metadata: strMap({
      purchaseOrderStatus: raw.PurchaseOrderStatus,
      companyId: raw.CompanyID,
    }),
    raw,
  }
}
