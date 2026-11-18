import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface MasteraccountingOrderLine {
  id: string
  description?: string
  unitPrice: number
  quantity: number
  amount: number
  [key: string]: unknown
}

export interface MasteraccountingOrder {
  id: string
  date: string
  status: string
  currency?: string
  totalSum?: number
  partnerId?: string
  lines?: MasteraccountingOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE'
    case 'COMPLETED':
      return 'COMPLETED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MasteraccountingOrderLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformOrder(raw: MasteraccountingOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.partnerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalSum || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
