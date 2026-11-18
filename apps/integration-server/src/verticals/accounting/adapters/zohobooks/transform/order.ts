import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface ZohoBooksQuoteLineItem {
  line_item_id: string
  item_id: string
  description: string
  rate: number
  quantity: number
  item_total: number
  tax_amount: number
  account_id: string
}

export interface ZohoBooksQuote {
  quote_id: string
  quote_number: string
  customer_id: string
  date: string
  expiry_date: string
  currency_code: string
  total: number
  status: 'draft' | 'sent' | 'invoiced' | 'accepted' | 'declined' | 'expired'
  line_items?: ZohoBooksQuoteLineItem[]
  [key: string]: unknown
}

function mapStatus(status: ZohoBooksQuote['status']): OrderStatus {
  switch (status) {
    case 'invoiced':
    case 'accepted': return 'COMPLETED'
    case 'declined':
    case 'expired': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineItem(li: ZohoBooksQuoteLineItem): Lineitem {
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

export function transformOrder(raw: ZohoBooksQuote): Order {
  return {
    id: raw.quote_id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
