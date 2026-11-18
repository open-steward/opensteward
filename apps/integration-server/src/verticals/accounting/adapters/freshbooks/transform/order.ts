import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface FreshBooksEstimateLine {
  lineid: number
  name: string
  description: string
  unit_cost: { amount: string; code: string }
  qty: string
  amount: { amount: string; code: string }
}

export interface FreshBooksEstimate {
  id: number
  client_id: number
  estimate_number: string
  date: string
  expiry_date: string
  currency_code: string
  amount: { amount: string; code: string }
  status: number
  lines: FreshBooksEstimateLine[]
  [key: string]: unknown
}

function mapStatus(status: number): OrderStatus {
  switch (status) {
    case 1: return 'DRAFT'
    case 2:
    case 3:
    case 4: return 'ACTIVE'
    case 5: return 'COMPLETED'
    case 6: return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(line: FreshBooksEstimateLine): Lineitem {
  return {
    id: String(line.lineid),
    itemDescription: line.description || line.name || undefined,
    unitAmount: line.unit_cost?.amount ? parseFloat(line.unit_cost.amount) : undefined,
    unitQuantity: line.qty ? parseFloat(line.qty) : undefined,
    totalAmount: line.amount?.amount ? parseFloat(line.amount.amount) : undefined,
  }
}

export function transformOrder(raw: FreshBooksEstimate): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount?.amount ? parseFloat(raw.amount.amount) : undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
