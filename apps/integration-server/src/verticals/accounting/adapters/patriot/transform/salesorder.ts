import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface PatriotSalesOrderLine {
  id: string
  description: string
  quantity: number
  rate: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface PatriotSalesOrder {
  id: string
  number: string
  contact_id: string
  currency: string
  date: string
  status: string
  total_amount: number
  tax_amount: number
  lines: PatriotSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toLowerCase()
  if (s === 'completed' || s === 'fulfilled') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void' || s === 'voided') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: PatriotSalesOrderLine): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.rate,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformSalesOrder(raw: PatriotSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    contact_id: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    lines: order.lineItems?.map((li) => ({
      description: li.itemDescription,
      rate: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
