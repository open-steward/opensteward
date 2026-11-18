import type { Order, OrderStatus } from '../../../schema/order'

export interface MyobOrder {
  UID?: string
  Number?: string
  Customer?: { UID?: string }
  Date?: string
  TotalAmount?: number
  Status?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): OrderStatus {
  switch (status) {
    case 'Open':
      return 'ACTIVE'
    case 'Closed':
      return 'COMPLETED'
    case 'Voided':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformOrder(raw: MyobOrder): Order {
  return {
    id: raw.UID || undefined,
    type: 'SALES',
    status: mapStatus(raw.Status),
    contactId: raw.Customer?.UID || undefined,
    totalAmount: raw.TotalAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
