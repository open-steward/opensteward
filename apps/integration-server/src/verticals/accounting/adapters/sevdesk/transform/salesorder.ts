import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface SevDeskSalesOrder {
  id: string
  orderNumber: string
  contact: { id: string } | null
  orderDate: string
  currency: string
  sumNet: string
  sumGross: string
  sumTax: string
  status: string
  orderType: string
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === '1000') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformSalesOrder(raw: SevDeskSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.sumGross) || undefined,
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
