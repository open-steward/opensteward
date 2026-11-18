import type { Order } from '../../../schema/order'

export interface InvoiceXpressOrder {
  id: number
  date: string
  client: { id: number; [key: string]: unknown }
  total: number
  currency: string
  [key: string]: unknown
}

export function transformOrder(raw: InvoiceXpressOrder): Order {
  return {
    id: String(raw.id),
    contactId: raw.client?.id ? String(raw.client.id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    type: 'SALES',
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
