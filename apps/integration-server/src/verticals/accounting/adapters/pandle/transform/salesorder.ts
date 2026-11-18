import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface PandleSalesOrderLine {
  id: number
  account_id: number
  description: string
  quantity: number
  unit_price: number
  net_amount: number
  tax_rate_id: number
  tax_amount: number
  total_amount: number
  [key: string]: unknown
}

export interface PandleSalesOrder {
  id: number
  order_number: string
  customer_id: number
  currency: string
  issue_date: string
  status: string
  net_amount: number
  tax_amount: number
  total_amount: number
  reference: string
  notes: string
  order_lines: PandleSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toLowerCase()
  if (s === 'completed' || s === 'fulfilled') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void' || s === 'voided') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: PandleSalesOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
    taxAmount: row.tax_amount || undefined,
    taxrateId: row.tax_rate_id ? String(row.tax_rate_id) : undefined,
  }
}

export function transformSalesOrder(raw: PandleSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.order_lines ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    customer_id: order.contactId ? Number(order.contactId) : undefined,
    currency: order.currency,
    issue_date: toCalendarDate(order.postedAt),
    order_lines: order.lineItems?.map((li) => ({
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
