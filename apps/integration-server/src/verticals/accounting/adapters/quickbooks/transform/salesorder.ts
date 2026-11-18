import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface QBOSalesOrderLine {
  Id: string
  Description: string
  Amount: number
  DetailType: string
  SalesItemLineDetail?: { ItemRef: { value: string }; UnitPrice?: number; Qty?: number }
}

export interface QBOSalesOrder {
  Id: string
  DocNumber: string
  CustomerRef: { value: string }
  TxnDate: string
  ExpirationDate?: string
  TotalAmt: number
  TxnStatus: string
  CurrencyRef?: { value: string }
  Line: QBOSalesOrderLine[]
  SalesTermRef?: { value: string }
  PONumber?: string
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'Closed':
    case 'Fulfilled': return 'COMPLETED'
    case 'Cancelled': return 'CANCELLED'
    case 'Pending': return 'DRAFT'
    default: return 'ACTIVE'
  }
}

function mapLines(lines: QBOSalesOrderLine[]): Lineitem[] {
  return (lines ?? [])
    .filter((l) => l.DetailType === 'SalesItemLineDetail')
    .map((l) => ({
      id: l.Id || undefined,
      itemId: l.SalesItemLineDetail?.ItemRef?.value || undefined,
      itemDescription: l.Description || undefined,
      unitAmount: l.SalesItemLineDetail?.UnitPrice,
      unitQuantity: l.SalesItemLineDetail?.Qty,
      totalAmount: l.Amount,
    }))
}

export function transformSalesOrder(raw: QBOSalesOrder): SalesOrder {
  return {
    id: raw.Id,
    status: mapStatus(raw.TxnStatus),
    contactId: raw.CustomerRef?.value || undefined,
    currency: raw.CurrencyRef?.value || undefined,
    totalAmount: raw.TotalAmt,
    lineItems: mapLines(raw.Line ?? []),
    postedAt: raw.TxnDate ? new Date(raw.TxnDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
