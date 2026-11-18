import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface WintOrderLine {
  id?: number | string
  text?: string
  qty?: number
  price?: number
  amount?: number
  account?: string | number
  [key: string]: unknown
}

export interface WintOrder {
  id: number | string
  contact_id?: number | string
  date?: string
  currency?: string
  gross?: number
  status?: string
  type?: string
  lines?: WintOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'confirmed':
      return 'ACTIVE'
    case 'completed':
    case 'delivered':
      return 'COMPLETED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: WintOrderLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    accountId: line.account != null ? String(line.account) : undefined,
    itemDescription: line.text || undefined,
    unitAmount: line.price,
    unitQuantity: line.qty,
    totalAmount: line.amount,
  }
}

export function transformOrder(raw: WintOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: raw.type?.toUpperCase() === 'PURCHASE' ? 'PURCHASE' : 'SALES',
    contactId: raw.contact_id != null ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
