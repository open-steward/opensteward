import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface ClearBooksOrderLine {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total_net: number
  tax_amount: number
  account_code: string
  [key: string]: unknown
}

export interface ClearBooksOrder {
  order_id: string | number
  order_number: string
  entity_id: string | number
  date_created: string
  total_gross: number
  total_tax: number
  currency: string
  status: string
  line_items: ClearBooksOrderLine[]
  [key: string]: unknown
}

function parseUkDate(dateStr: string | undefined | null): Date | undefined {
  if (!dateStr) return undefined
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/')
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  }
  return new Date(dateStr)
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'active':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: ClearBooksOrderLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_code || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total_net,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformOrder(raw: ClearBooksOrder): Order {
  return {
    id: String(raw.order_id),
    status: mapStatus(raw.status),
    contactId: raw.entity_id ? String(raw.entity_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_gross,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: parseUkDate(raw.date_created as string),
    metadata: raw as Record<string, unknown>,
  }
}
