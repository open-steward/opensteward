import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface LexofficeSalesOrder {
  id: string
  voucherNumber: string
  voucherDate: string
  contactId: string
  totalAmount: number
  currency: string
  voucherStatus: string
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'ACTIVE'
    case 'accepted':
    case 'invoiced': return 'COMPLETED'
    case 'cancelled':
    case 'rejected': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: LexofficeSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.voucherStatus),
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
