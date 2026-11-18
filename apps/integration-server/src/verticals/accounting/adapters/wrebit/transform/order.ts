import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface WrebitOrderLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  account?: string | number
  [key: string]: unknown
}

export interface WrebitOrder {
  id: number | string
  contact_id?: number | string
  date?: string
  currency?: string
  gross_amount?: number
  status?: string
  type?: string
  lines?: WrebitOrderLine[]
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

function mapLineitem(line: WrebitOrderLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account !== undefined ? String(line.account) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
  }
}

export function transformOrder(raw: WrebitOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: raw.type?.toUpperCase() === 'PURCHASE' ? 'PURCHASE' : 'SALES',
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
