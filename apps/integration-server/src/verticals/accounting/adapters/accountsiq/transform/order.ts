import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface AccountsIQOrderLine {
  lineId: string | number
  description: string
  quantity: number
  unitPrice: number
  lineAmount: number
  taxAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface AccountsIQOrder {
  orderId: string | number
  entityId: string | number
  status: string
  orderNumber: string
  orderDate: string
  totalAmount: number
  currency: string
  contactId: string | number
  lines: AccountsIQOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'Completed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Posted':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AccountsIQOrderLine): Lineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.lineAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformOrder(raw: AccountsIQOrder): Order {
  return {
    id: String(raw.orderId),
    status: mapStatus(raw.status),
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
