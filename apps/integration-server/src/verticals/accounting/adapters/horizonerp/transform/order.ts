import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface HorizonErpOrderLineItem {
  id: string
  name: string
  description: string
  qty: number
  rate: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface HorizonErpOrder {
  id: string
  order_no: string
  order_date: string
  total_amount: number
  status: string
  customer_id: string
  currency: string
  line_items: HorizonErpOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open':
    case 'active': return 'ACTIVE'
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: HorizonErpOrderLineItem): Lineitem {
  return {
    id: String(item.id),
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.qty,
    unitAmount: item.rate,
    totalAmount: item.amount,
    taxAmount: item.tax_amount,
    accountId: item.account_id || undefined,
  }
}

export function transformOrder(raw: HorizonErpOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.order_date ? new Date(raw.order_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    customer_id: order.contactId,
    currency: order.currency,
    order_date: toCalendarDate(order.postedAt),
    line_items: order.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      qty: li.unitQuantity,
      rate: li.unitAmount,
      account_id: li.accountId,
    })),
  }
}
