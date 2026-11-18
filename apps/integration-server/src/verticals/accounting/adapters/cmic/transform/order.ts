import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface CmicOrderLine {
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

export interface CmicOrder {
  OrderId: string
  OrderNumber: string
  Status: string
  SubcontractorId: string
  ProjectCode: string
  Currency: string
  TotalAmount: number
  OrderDate: string
  Lines: CmicOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
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

function mapLineitem(line: CmicOrderLine): Lineitem {
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

export function transformOrder(raw: CmicOrder): Order {
  return {
    id: String(raw.OrderId),
    status: mapStatus(raw.Status),
    contactId: raw.SubcontractorId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
