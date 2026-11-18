import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface DaftraSalesOrder {
  id: string
  OrderNo?: string
  Date?: string
  Status?: string
  TotalAmount?: number
  ClientId?: string
  Currency?: string
  [key: string]: unknown
}

function mapStatus(status?: string): SalesOrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

export function transformSalesOrder(raw: DaftraSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    contactId: raw.ClientId ? String(raw.ClientId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
