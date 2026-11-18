import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface FreeeQuoteContent {
  id: number
  name: string
  quantity: number
  unit_price: number
  amount: number
  vat_rate: number
  account_item_id: number | null
  account_item_name: string | null
  [key: string]: unknown
}

export interface FreeeQuote {
  id: number
  quote_number: string
  issue_date: string
  due_date: string
  total_amount_with_vat: number
  total_vat_amount: number
  status: string
  partner_id: number | null
  partner_name: string | null
  quote_contents: FreeeQuoteContent[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'accepted') return 'COMPLETED'
  if (status === 'refused') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: FreeeQuoteContent): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_item_id ? String(row.account_item_id) : undefined,
    itemDescription: row.name || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.vat_rate ? (row.amount * row.vat_rate) / (100 + row.vat_rate) : undefined,
  }
}

export function transformOrder(raw: FreeeQuote): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status as string),
    type: 'SALES',
    contactId: raw.partner_id ? String(raw.partner_id) : undefined,
    totalAmount: raw.total_amount_with_vat,
    lineItems: (raw.quote_contents ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
