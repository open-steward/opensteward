import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface ZohoBooksSalesOrderLineItem {
  line_item_id: string
  item_id: string
  description: string
  rate: number
  quantity: number
  item_total: number
  tax_amount: number
  account_id: string
}

export interface ZohoBooksSalesOrder {
  salesorder_id: string
  salesorder_number: string
  customer_id: string
  date: string
  shipment_date: string
  currency_code: string
  total: number
  tax_total: number
  status: 'draft' | 'confirmed' | 'void' | 'invoiced'
  line_items?: ZohoBooksSalesOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: ZohoBooksSalesOrder['status']): SalesOrderStatus {
  switch (status) {
    case 'invoiced': return 'COMPLETED'
    case 'void': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineItem(li: ZohoBooksSalesOrderLineItem): Lineitem {
  return {
    id: li.line_item_id || undefined,
    itemId: li.item_id || undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.rate,
    unitQuantity: li.quantity,
    totalAmount: li.item_total,
    taxAmount: li.tax_amount || undefined,
    accountId: li.account_id || undefined,
  }
}

export function transformSalesOrder(raw: ZohoBooksSalesOrder): SalesOrder {
  return {
    id: raw.salesorder_id,
    status: mapStatus(raw.status),
    contactId: raw.customer_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
