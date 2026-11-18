import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface SunriseSalesOrderItem {
  id: string
  name: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface SunriseSalesOrder {
  id: string
  order_number: string
  contact_id: string
  currency: string
  total_amount: number
  tax_amount: number
  date: string
  status: string
  line_items: SunriseSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toLowerCase() ?? ''
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: SunriseSalesOrderItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformSalesOrder(raw: SunriseSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    contact_id: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    line_items: order.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
