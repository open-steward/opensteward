import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface StessaSalesOrderItem {
  id: string
  name: string
  description: string
  quantity: number
  unitPrice: number
  total: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface StessaSalesOrder {
  id: string
  orderNumber: string
  contactId: string
  currency: string
  total: number
  taxAmount: number
  date: string
  status: string
  items: StessaSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toLowerCase() ?? ''
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: StessaSalesOrderItem): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformSalesOrder(raw: StessaSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    contactId: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId,
    })),
  }
}
