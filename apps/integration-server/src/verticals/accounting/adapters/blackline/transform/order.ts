import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface BlacklineOrderLine {
  lineId: string
  description: string
  quantity: number
  unitAmount: number
  totalAmount: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface BlacklineOrder {
  orderId: string
  orderNumber: string
  status: string
  accountId: string
  currency: string
  totalAmount: number
  orderDate: string
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  lines: BlacklineOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'Approved':
      return 'ACTIVE'
    case 'Closed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: BlacklineOrderLine): Lineitem {
  return {
    id: line.lineId,
    accountId: line.accountId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitAmount,
    unitQuantity: line.quantity,
    totalAmount: line.totalAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformOrder(raw: BlacklineOrder): Order {
  return {
    id: String(raw.orderId),
    status: mapStatus(raw.status),
    contactId: raw.accountId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
