/**
 * Transform D365 SCM PurchaseOrderHeaderV2 + PurchaseOrderLineV2 → canonical PurchaseOrder.
 *
 * OData entity: PurchaseOrderHeadersV2 (joined with PurchaseOrderLinesV2)
 * Header key fields:
 *   PurchaseOrderNumber       — primary key
 *   OrderVendorAccountNumber  — vendor account number
 *   PurchaseOrderStatus       — "None" | "BackOrder" | "Received" | "Invoiced" | "Cancelled"
 *   CurrencyCode              — transaction currency
 *   DeliveryAddressWarehouseId — destination warehouse
 *   RequestedDeliveryDate     — expected delivery date
 *   ConfirmedDeliveryDate     — confirmed delivery date
 *   DataAreaId                — legal entity
 *   TotalInvoiceAmount        — total (raw decimal, in transaction currency)
 *   TotalDiscountAmount       — discount amount
 *
 * Line key fields:
 *   PurchaseOrderNumber       — FK to header
 *   LineNumber                — line number
 *   ItemNumber                — product item number
 *   PurchaseQuantity          — ordered quantity
 *   RemainPurchasePhysical    — remaining (not yet received)
 *   PurchasePrice             — unit price (raw decimal)
 *   LineAmount                — line total (raw decimal)
 *   WarehouseId               — destination warehouse for the line
 *   DataAreaId                — legal entity
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawD365PurchaseOrderLine {
  PurchaseOrderNumber: string
  LineNumber?: number | string
  ItemNumber: string
  PurchaseQuantity?: number | string
  /** Ordered - not yet received. */
  RemainPurchasePhysical?: number | string
  /** Ordered - not yet invoiced. */
  RemainPurchaseFinancial?: number | string
  /** Unit price as decimal in transaction currency. */
  PurchasePrice?: number | string
  /** Line total as decimal in transaction currency. */
  LineAmount?: number | string
  WarehouseId?: string
  DataAreaId?: string
  [key: string]: unknown
}

export interface RawD365PurchaseOrder {
  PurchaseOrderNumber: string
  OrderVendorAccountNumber?: string
  PurchaseOrderStatus?: string
  CurrencyCode?: string
  DeliveryAddressWarehouseId?: string
  /** Expected delivery (ISO or /Date(ms)/). */
  RequestedDeliveryDate?: string
  ConfirmedDeliveryDate?: string
  /** Date the order was created. */
  CreatedDateTime?: string
  DataAreaId?: string
  /** Totals as raw decimals in transaction currency. */
  TotalInvoiceAmount?: number | string
  TotalDiscountAmount?: number | string
  /** Lines are typically fetched via $expand=PurchaseOrderLines or a separate request. */
  PurchaseOrderLines?: RawD365PurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'none':
    case 'draft':
      return 'draft'
    case 'backorder':
    case 'confirmed':
    case 'approved':
      return 'sent'
    case 'received':
      return 'received'
    case 'invoiced':
      return 'closed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawD365PurchaseOrder): PurchaseOrder {
  const totalDecimal = pickNum(raw.TotalInvoiceAmount)

  return {
    id: raw.PurchaseOrderNumber,
    externalId: raw.PurchaseOrderNumber,
    number: pickStr(raw.PurchaseOrderNumber),
    supplierId: pickStr(raw.OrderVendorAccountNumber) ?? '',
    destinationLocationId: pickStr(raw.DeliveryAddressWarehouseId),
    status: mapStatus(raw.PurchaseOrderStatus),
    currency: pickStr(raw.CurrencyCode),
    subtotalAmount: totalDecimal !== undefined ? Math.round(totalDecimal * 100) : undefined,
    totalAmount: totalDecimal !== undefined ? Math.round(totalDecimal * 100) : undefined,
    lines: (raw.PurchaseOrderLines ?? []).map((l) => {
      const qty = pickNum(l.PurchaseQuantity) ?? 0
      const received = qty - (pickNum(l.RemainPurchasePhysical) ?? qty)
      const unitPriceDecimal = pickNum(l.PurchasePrice)
      const lineTotalDecimal = pickNum(l.LineAmount)
      return {
        productId: l.ItemNumber,
        quantityOrdered: qty,
        quantityReceived: received >= 0 ? received : undefined,
        unitCost: unitPriceDecimal !== undefined ? Math.round(unitPriceDecimal * 100) : undefined,
        lineTotal: lineTotalDecimal !== undefined ? Math.round(lineTotalDecimal * 100) : undefined,
      }
    }),
    expectedAt: toIso(raw.ConfirmedDeliveryDate ?? raw.RequestedDeliveryDate),
    orderedAt: toIso(raw.CreatedDateTime),
    receivedAt:
      mapStatus(raw.PurchaseOrderStatus) === 'received' || mapStatus(raw.PurchaseOrderStatus) === 'closed'
        ? toIso(raw.ConfirmedDeliveryDate)
        : undefined,
    platform: 'dynamics-365-scm',
    metadata: strMap({
      dataAreaId: raw.DataAreaId,
      purchaseOrderStatus: raw.PurchaseOrderStatus,
      requestedDeliveryDate: raw.RequestedDeliveryDate,
    }),
    raw,
  }
}
