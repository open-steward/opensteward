import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface IntacctSalesOrder {
  RECORDNO: string
  DOCID: string
  CUSTOMERID: string
  WHENORDERED: string
  WHENEXPIRED: string
  CURRENCY: string
  TOTAL: string
  STATE: 'Draft' | 'Pending' | 'Closed' | 'Cancelled'
  [key: string]: unknown
}

function mapStatus(state: IntacctSalesOrder['STATE']): SalesOrderStatus {
  if (state === 'Closed') return 'COMPLETED'
  if (state === 'Cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformSalesOrder(raw: IntacctSalesOrder): SalesOrder {
  return {
    id: raw.RECORDNO,
    status: mapStatus(raw.STATE),
    contactId: raw.CUSTOMERID || undefined,
    currency: raw.CURRENCY || undefined,
    totalAmount: parseFloat(raw.TOTAL),
    postedAt: raw.WHENORDERED ? new Date(raw.WHENORDERED) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
