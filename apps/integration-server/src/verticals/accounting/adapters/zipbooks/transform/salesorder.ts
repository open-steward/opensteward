import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface ZipBooksSalesOrderItem {
  id: string
  name: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface ZipBooksSalesOrder {
  id: string
  order_number: string
  contact_id: string
  currency: string
  total: number
  tax_amount: number
  date: string
  status: string
  items: ZipBooksSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toLowerCase()
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: ZipBooksSalesOrderItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformSalesOrder(raw: ZipBooksSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    contact_id: order.contactId,
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
