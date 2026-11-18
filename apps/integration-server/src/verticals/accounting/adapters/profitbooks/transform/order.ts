import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface ProfitBooksOrderItem {
  id: string
  name: string
  description: string
  quantity: number
  rate: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface ProfitBooksOrder {
  id: string
  order_number: string
  contact_id: string
  currency: string
  total_amount: number
  tax_amount: number
  items: ProfitBooksOrderItem[]
  date: string
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  const s = status?.toLowerCase() ?? ''
  if (s === 'completed' || s === 'fulfilled') return 'COMPLETED'
  if (s === 'cancelled') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: ProfitBooksOrderItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.rate || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformOrder(raw: ProfitBooksOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    contact_id: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      rate: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
