import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface MaxioSalesOrderLineItem {
  id: number
  name: string
  quantity: number
  unit_price_in_cents: number
  total_amount_in_cents: number
  [key: string]: unknown
}

export interface MaxioSalesOrder {
  id: number
  state: string
  created_at: string
  currency: string
  total_amount_in_cents: number
  customer_id: number | null
  line_items: MaxioSalesOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(state: string): SalesOrderStatus {
  switch (state) {
    case 'active':
      return 'ACTIVE'
    case 'completed':
      return 'COMPLETED'
    case 'canceled':
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MaxioSalesOrderLineItem): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.name || undefined,
    unitAmount: typeof line.unit_price_in_cents === 'number' ? line.unit_price_in_cents / 100 : 0,
    unitQuantity: line.quantity,
    totalAmount: typeof line.total_amount_in_cents === 'number' ? line.total_amount_in_cents / 100 : 0,
  }
}

export function transformSalesOrder(raw: MaxioSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: typeof raw.total_amount_in_cents === 'number' ? raw.total_amount_in_cents / 100 : 0,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
