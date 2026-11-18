import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface MoneyForwardQuoteSO {
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

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'accepted') return 'COMPLETED'
  if (status === 'rejected') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformSalesOrder(raw: MoneyForwardQuoteSO): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status as string),
    contactId: raw.partner_id ? String(raw.partner_id) : undefined,
    totalAmount: raw.price,
    postedAt: raw.quote_date ? new Date(raw.quote_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
