import type { SalesOrder } from '../../../schema/salesorder'

export interface InvoiceXpressSalesOrder {
  id: number
  date: string
  client: { id: number; [key: string]: unknown }
  total: number
  currency: string
  [key: string]: unknown
}

export function transformSalesOrder(raw: InvoiceXpressSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    contactId: raw.client?.id ? String(raw.client.id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
