import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import type { SendRegningLine } from './invoice'

export interface SendRegningOrder {
  id: string
  date?: string
  recipientId?: string
  currency?: string
  status?: string
  lines?: SendRegningLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return 'ACTIVE'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: SendRegningLine): Lineitem {
  return {
    id: line.id,
    accountId: line.accountNo || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.total,
  }
}

export function transformOrder(raw: SendRegningOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.recipientId || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
