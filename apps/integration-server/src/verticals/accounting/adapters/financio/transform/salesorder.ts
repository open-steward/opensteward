import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface FinancioQuoteItem {
  id: string | number
  description: string
  qty: number
  unit_price: number
  amount: number
  tax_amount: number
  account_code: string
  tax_rate: number
  discount_amount: number
  [key: string]: unknown
}

export interface FinancioQuote {
  id: string | number
  quote_no: string
  quote_date: string
  expiry_date: string
  sub_total: number
  tax_total: number
  grand_total: number
  status: string
  customer_id: string | number
  customer_name: string
  items: FinancioQuoteItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'accepted':
      return 'COMPLETED'
    case 'rejected':
      return 'CANCELLED'
    case 'sent':
      return 'ACTIVE'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(item: FinancioQuoteItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
    discountAmount: item.discount_amount || undefined,
  }
}

export function transformSalesOrder(raw: FinancioQuote): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    totalAmount: raw.grand_total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.quote_date ? new Date(raw.quote_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
