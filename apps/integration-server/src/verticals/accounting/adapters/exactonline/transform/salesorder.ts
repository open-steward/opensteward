import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface ExactSalesOrder {
  OrderID?: string
  OrderNumber?: number | string
  OrderedBy?: string
  AmountDC?: number
  Currency?: string
  Status?: number
  OrderDate?: string
  [key: string]: unknown
}

function mapStatus(status: number | undefined): SalesOrderStatus {
  switch (status) {
    case 12:
      return 'DRAFT'
    case 45:
      return 'COMPLETED'
    case 46:
      return 'CANCELLED'
    case 20:
    case 21:
    default:
      return 'ACTIVE'
  }
}

export function transformSalesOrder(raw: ExactSalesOrder): SalesOrder {
  return {
    id: raw.OrderID || undefined,
    status: mapStatus(raw.Status),
    contactId: raw.OrderedBy || undefined,
    totalAmount: raw.AmountDC,
    currency: raw.Currency || undefined,
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
