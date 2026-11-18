import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface AcumaticaPurchaseOrderLine {
  LineNbr: number
  InventoryID: string
  Description: string
  OrderQty: number
  UnitCost: number
  ExtCost: number
  TaxAmt: number
  AccountID: string
  [key: string]: unknown
}

export interface AcumaticaPurchaseOrder {
  OrderNbr: string
  OrderType: string
  Status: string
  CuryOrderTotal: number
  CurrencyID: string
  VendorID: string
  OrderDate: string
  Details: AcumaticaPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Completed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Open':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AcumaticaPurchaseOrderLine): Lineitem {
  return {
    id: String(line.LineNbr),
    accountId: line.AccountID || undefined,
    itemId: line.InventoryID || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitCost,
    unitQuantity: line.OrderQty,
    totalAmount: line.ExtCost,
    taxAmount: line.TaxAmt || undefined,
  }
}

export function transformPurchaseOrder(raw: AcumaticaPurchaseOrder): PurchaseOrder {
  return {
    id: raw.OrderNbr,
    status: mapStatus(raw.Status),
    contactId: raw.VendorID || undefined,
    currency: raw.CurrencyID || undefined,
    totalAmount: raw.CuryOrderTotal,
    lineItems: (raw.Details ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
