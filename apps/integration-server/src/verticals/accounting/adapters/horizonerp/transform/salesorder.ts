import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface HorizonErpSalesOrderLineItem {
  id: string
  name: string
  description: string
  qty: number
  rate: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface HorizonErpSalesOrder {
  id: string
  order_no: string
  order_date: string
  total_amount: number
  status: string
  customer_id: string
  currency: string
  line_items: HorizonErpSalesOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open':
    case 'active': return 'ACTIVE'
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: HorizonErpSalesOrderLineItem): Lineitem {
  return {
    id: String(item.id),
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.qty,
    unitAmount: item.rate,
    totalAmount: item.amount,
    taxAmount: item.tax_amount,
    accountId: item.account_id || undefined,
  }
}

export function transformSalesOrder(raw: HorizonErpSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.order_date ? new Date(raw.order_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(so: Partial<SalesOrder>): Record<string, unknown> {
  return {
    customer_id: so.contactId,
    currency: so.currency,
    order_date: toCalendarDate(so.postedAt),
    line_items: so.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      qty: li.unitQuantity,
      rate: li.unitAmount,
      account_id: li.accountId,
    })),
  }
}
