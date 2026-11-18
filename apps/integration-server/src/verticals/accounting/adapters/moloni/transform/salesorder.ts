import type { SalesOrder } from '../../../schema/salesorder'

export interface MoloniSalesOrder {
  document_id: number
  date: string
  client_id: number
  net_value: number
  currency_code: string
  status: number
  [key: string]: unknown
}

export function transformSalesOrder(raw: MoloniSalesOrder): SalesOrder {
  return {
    id: String(raw.document_id),
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.net_value,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
