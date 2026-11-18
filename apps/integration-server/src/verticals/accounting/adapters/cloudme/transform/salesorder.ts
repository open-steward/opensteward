import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface CloudMeSalesOrderLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface CloudMeSalesOrder {
  id: string | number
  order_number: string
  order_date: string
  status: string
  customer_id: string | number
  currency_code: string
  total: number
  line_items: CloudMeSalesOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'draft':
      return 'DRAFT'
    case 'active':
    case 'open':
      return 'ACTIVE'
    case 'completed':
    case 'paid':
      return 'COMPLETED'
    case 'cancelled':
    case 'void':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: CloudMeSalesOrderLineItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.total,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformSalesOrder(raw: CloudMeSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.order_date ? new Date(raw.order_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
