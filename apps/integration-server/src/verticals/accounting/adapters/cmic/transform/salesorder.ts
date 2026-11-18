import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface CmicSalesOrderLine {
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

export interface CmicSalesOrder {
  SalesOrderId: string
  OrderNumber: string
  Status: string
  ClientId: string
  ProjectCode: string
  Currency: string
  TotalAmount: number
  OrderDate: string
  Lines: CmicSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
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

function mapLineitem(line: CmicSalesOrderLine): Lineitem {
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

export function transformSalesOrder(raw: CmicSalesOrder): SalesOrder {
  return {
    id: String(raw.SalesOrderId),
    status: mapStatus(raw.Status),
    contactId: raw.ClientId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
