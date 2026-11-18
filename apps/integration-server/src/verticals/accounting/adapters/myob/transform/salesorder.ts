import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface MyobSalesOrder {
  UID?: string
  Number?: string
  Customer?: { UID?: string }
  Date?: string
  TotalAmount?: number
  Status?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): SalesOrderStatus {
  switch (status) {
    case 'Closed':
      return 'COMPLETED'
    case 'Voided':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformSalesOrder(raw: MyobSalesOrder): SalesOrder {
  return {
    id: raw.UID || undefined,
    status: mapStatus(raw.Status),
    contactId: raw.Customer?.UID || undefined,
    totalAmount: raw.TotalAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
