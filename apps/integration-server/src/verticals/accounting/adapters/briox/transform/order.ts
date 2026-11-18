import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface BrioxOrderLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  account_number?: string | number
  [key: string]: unknown
}

export interface BrioxOrder {
  id: number | string
  contact_id?: number | string
  date?: string
  currency?: string
  total?: number
  status?: string
  type?: string
  lines?: BrioxOrderLine[]
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

function mapLineitem(line: BrioxOrderLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    accountId: line.account_number != null ? String(line.account_number) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
  }
}

export function transformOrder(raw: BrioxOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: raw.type?.toUpperCase() === 'PURCHASE' ? 'PURCHASE' : 'SALES',
    contactId: raw.contact_id != null ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
