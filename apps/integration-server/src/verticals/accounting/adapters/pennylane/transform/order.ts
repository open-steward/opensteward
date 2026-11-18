import type { Order, OrderStatus } from '../../../schema/order'

export interface PennylaneQuote {
  id: string
  quote_number: string
  customer: { source_id: string } | null
  date: string
  deadline: string | null
  currency: string
  amount: number
  status: 'draft' | 'awaiting_acceptance' | 'accepted' | 'rejected' | 'cancelled'
  [key: string]: unknown
}

function mapStatus(status: PennylaneQuote['status']): OrderStatus {
  if (status === 'accepted') return 'COMPLETED'
  if (status === 'rejected' || status === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformOrder(raw: PennylaneQuote): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer?.source_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
