/**
 * Transform SYSPRO PorMasterHdr + PorMasterDetail OData entities
 * → canonical PurchaseOrder.
 *
 * The adapter queries PorMasterHdr with $expand=PorMasterDetail to
 * retrieve header + lines in one call.
 *
 * Confirmed field names from SYSPRO 8 docs:
 *   PorMasterHdr: PurchaseOrder (number/key), Supplier, SupplierName,
 *     OrderStatus, OrderDate, DueDate, Currency,
 *     OrderDiscount1, OrderDiscount2, OrderDiscount3,
 *     OriginalOrderValue, CompletedDate, Warehouse (default delivery wh)
 *
 *   PorMasterDetail: PurchaseOrder, Line, StockCode, OrderQty,
 *     ReceivedQty, UnitCost, LineValue, DueDate
 *
 * SYSPRO OrderStatus codes (confirmed from UI docs):
 *   '1' = Active/Open, '2' = Complete, '3' = Cancelled, '4' = On hold,
 *   '5' = Pending (unapproved), '6' = Partially received
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSysproPurchaseOrderLine {
  PurchaseOrder?: string
  Line?: number
  StockCode?: string
  OrderQty?: number
  ReceivedQty?: number
  UnitCost?: number
  LineValue?: number
  DueDate?: string
  [key: string]: unknown
}

export interface RawSysproPurchaseOrder {
  /** Purchase order number — primary key */
  PurchaseOrder: string
  /** Supplier code */
  Supplier?: string
  SupplierName?: string
  /**
   * SYSPRO status: '1'=open, '2'=complete, '3'=cancelled,
   * '4'=on hold, '5'=pending, '6'=partially received
   */
  OrderStatus?: string
  OrderDate?: string
  DueDate?: string
  Currency?: string
  /** Total order value in company/supplier currency (major units) */
  OriginalOrderValue?: number
  CompletedDate?: string
  /** Default delivery warehouse */
  Warehouse?: string
  /** Expanded detail lines from PorMasterDetail */
  PorMasterDetail?: RawSysproPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').trim()) {
    case '1': return 'sent'               // Active / Open
    case '2': return 'closed'             // Completed
    case '3': return 'cancelled'          // Cancelled
    case '4': return 'draft'              // On hold
    case '5': return 'draft'              // Pending / unapproved
    case '6': return 'partially_received' // Partially received
    default:  return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSysproPurchaseOrder): PurchaseOrder {
  const lines = (raw.PorMasterDetail ?? []).map((l) => ({
    productId:        l.StockCode ?? '',
    quantityOrdered:  l.OrderQty ?? 0,
    quantityReceived: l.ReceivedQty,
    unitCost:         l.UnitCost,
    lineTotal:        l.LineValue,
  }))

  return {
    id: raw.PurchaseOrder,
    externalId: raw.PurchaseOrder,
    number: raw.PurchaseOrder,
    supplierId: raw.Supplier ?? '',
    destinationLocationId: pickStr(raw.Warehouse),
    status: mapStatus(raw.OrderStatus),
    currency: pickStr(raw.Currency),
    subtotalAmount: undefined,          // not a distinct field on PorMasterHdr
    totalAmount: raw.OriginalOrderValue,
    lines,
    expectedAt: toIso(raw.DueDate),
    orderedAt:  toIso(raw.OrderDate),
    receivedAt: toIso(raw.CompletedDate),
    platform: 'syspro',
    metadata: strMap({
      orderStatus:  raw.OrderStatus,
      supplierName: raw.SupplierName,
    }),
    raw,
  }
}
