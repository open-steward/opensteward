import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface FinlySalesOrderItem {
  id: string
  name: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax: number
  account_id: string
  [key: string]: unknown
}

export interface FinlySalesOrder {
  id: string
  order_number: string
  customer_id: string
  currency: string
  subtotal: number
  tax_amount: number
  total_amount: number
  items: FinlySalesOrderItem[]
  date: string
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toLowerCase()
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: FinlySalesOrderItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
  }
}

export function transformSalesOrder(raw: FinlySalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    customer_id: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
