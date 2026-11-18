import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface ErpNextSalesOrderItem {
  name: string
  item_name: string
  qty: number
  rate: number
  amount: number
  item_tax_amount: number
  income_account: string
  [key: string]: unknown
}

export interface ErpNextSalesOrder {
  name: string
  transaction_date: string
  status: string
  currency: string
  base_grand_total: number
  customer: string
  remarks: string
  items: ErpNextSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'To Deliver and Bill':
    case 'To Bill':
    case 'To Deliver':
      return 'ACTIVE'
    case 'Completed': return 'COMPLETED'
    case 'Cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(item: ErpNextSalesOrderItem): Lineitem {
  return {
    id: item.name || undefined,
    accountId: item.income_account || undefined,
    itemDescription: item.item_name || undefined,
    unitAmount: item.rate,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.item_tax_amount || undefined,
  }
}

export function transformSalesOrder(raw: ErpNextSalesOrder): SalesOrder {
  return {
    id: raw.name,
    status: mapStatus(raw.status),
    contactId: raw.customer || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.base_grand_total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
