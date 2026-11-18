import type { Order, OrderStatus } from '../../../schema/order'

export interface MoneyForwardQuote {
  id: string
  quote_number: string | null
  quote_date: string
  expiry_date: string
  price_before_tax: number
  price: number
  tax: number
  status: string
  partner_id: string | null
  partner_name: string | null
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'accepted') return 'COMPLETED'
  if (status === 'rejected') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformOrder(raw: MoneyForwardQuote): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status as string),
    type: 'SALES',
    contactId: raw.partner_id ? String(raw.partner_id) : undefined,
    totalAmount: raw.price,
    postedAt: raw.quote_date ? new Date(raw.quote_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
