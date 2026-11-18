import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface BukkuSalesOrderLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_id: string | number
  account_code: string
  discount: number
  [key: string]: unknown
}

export interface BukkuSalesOrder {
  id: string | number
  number: string
  date: string
  total: number
  tax_total: number
  status: string
  contact_id: string | number
  contact_name: string
  line_items: BukkuSalesOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'delivered':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'confirmed':
      return 'ACTIVE'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(item: BukkuSalesOrderLineItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
    discountAmount: item.discount || undefined,
  }
}

export function transformSalesOrder(raw: BukkuSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    totalAmount: raw.total,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
