import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface JalebiSalesOrderLineItem {
  id: string | number
  name: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  [key: string]: unknown
}

export interface JalebiSalesOrder {
  id: string | number
  order_number: string
  created_at: string
  status: string
  customer_id: string | number
  currency: string
  grand_total: number
  items: JalebiSalesOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'pending':
      return 'DRAFT'
    case 'confirmed':
      return 'ACTIVE'
    case 'paid':
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: JalebiSalesOrderLineItem): Lineitem {
  return {
    id: String(item.id),
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.total,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformSalesOrder(raw: JalebiSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grand_total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
