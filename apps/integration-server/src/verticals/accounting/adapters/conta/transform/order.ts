import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import type { ContaLine } from './invoice'

export interface ContaOrder {
  id: string
  date?: string
  customer_id?: string
  currency?: string
  status?: string
  lines?: ContaLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return 'ACTIVE'
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: ContaLine): Lineitem {
  return {
    id: line.id,
    accountId: line.account_id || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
  }
}

export function transformOrder(raw: ContaOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
