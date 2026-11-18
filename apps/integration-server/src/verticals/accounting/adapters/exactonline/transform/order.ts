import type { Order, OrderStatus } from '../../../schema/order'

export interface ExactOrder {
  OrderID?: string
  OrderNumber?: number | string
  OrderedBy?: string
  AmountDC?: number
  Currency?: string
  Status?: number
  OrderDate?: string
  [key: string]: unknown
}

function mapStatus(status: number | undefined): OrderStatus {
  switch (status) {
    case 12:
      return 'DRAFT'
    case 20:
    case 21:
      return 'ACTIVE'
    case 45:
      return 'COMPLETED'
    case 46:
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformOrder(raw: ExactOrder): Order {
  return {
    id: raw.OrderID || undefined,
    type: 'SALES',
    status: mapStatus(raw.Status),
    contactId: raw.OrderedBy || undefined,
    totalAmount: raw.AmountDC,
    currency: raw.Currency || undefined,
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
