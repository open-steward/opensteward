import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface BillomatSalesOrderLine {
  id: string
  article_id: string
  description: string
  quantity: number
  unit_price: number
  total_gross: number
  tax_rate: number
  tax_amount: number
  account_id: string
  discount: number
  [key: string]: unknown
}

export interface BillomatSalesOrder {
  id: string
  order_number: string
  client_id: string
  currency_code: string
  date: string
  status: string
  total_gross: number
  total_net: number
  tax_amount: number
  order_items: BillomatSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toUpperCase()
  if (s === 'COMPLETED' || s === 'INVOICED') return 'COMPLETED'
  if (s === 'CANCELED' || s === 'CANCELLED') return 'CANCELLED'
  if (s === 'DRAFT') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: BillomatSalesOrderLine): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemId: row.article_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_gross,
    taxAmount: row.tax_amount || undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformSalesOrder(raw: BillomatSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.client_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_gross,
    lineItems: (raw.order_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    client_id: order.contactId,
    currency_code: order.currency,
    date: toCalendarDate(order.postedAt),
    order_items: order.lineItems?.map((li) => ({
      article_id: li.itemId,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
