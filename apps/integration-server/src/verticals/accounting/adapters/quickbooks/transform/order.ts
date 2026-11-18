import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface QBOEstimateLine {
  Id: string
  Description: string
  Amount: number
  DetailType: string
  SalesItemLineDetail?: { ItemRef: { value: string }; UnitPrice?: number; Qty?: number }
}

export interface QBOEstimate {
  Id: string
  DocNumber: string
  CustomerRef: { value: string }
  TxnDate: string
  ExpirationDate: string
  TotalAmt: number
  TxnStatus: string
  CurrencyRef?: { value: string }
  Line: QBOEstimateLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'Accepted': return 'COMPLETED'
    case 'Rejected':
    case 'Closed': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLines(lines: QBOEstimateLine[]): Lineitem[] {
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

export function transformOrder(raw: QBOEstimate): Order {
  return {
    id: raw.Id,
    status: mapStatus(raw.TxnStatus),
    type: 'SALES',
    contactId: raw.CustomerRef?.value || undefined,
    currency: raw.CurrencyRef?.value || undefined,
    totalAmount: raw.TotalAmt,
    lineItems: mapLines(raw.Line ?? []),
    postedAt: raw.TxnDate ? new Date(raw.TxnDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
