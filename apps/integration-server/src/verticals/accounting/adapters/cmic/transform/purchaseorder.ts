import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface CmicPurchaseOrderLine {
  LineId: string
  Description: string
  Quantity: number
  UnitPrice: number
  LineAmount: number
  TaxAmount: number
  AccountCode: string
  CostCode: string
  [key: string]: unknown
}

export interface CmicPurchaseOrder {
  PurchaseOrderId: string
  OrderNumber: string
  Status: string
  VendorId: string
  ProjectCode: string
  Currency: string
  TotalAmount: number
  OrderDate: string
  Lines: CmicPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Approved':
      return 'ACTIVE'
    case 'Closed':
      return 'COMPLETED'
    case 'Void':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: CmicPurchaseOrderLine): Lineitem {
  return {
    id: line.LineId,
    accountId: line.AccountCode || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    totalAmount: line.LineAmount,
    taxAmount: line.TaxAmount || undefined,
  }
}

export function transformPurchaseOrder(raw: CmicPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.PurchaseOrderId),
    status: mapStatus(raw.Status),
    contactId: raw.VendorId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
