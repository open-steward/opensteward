import type { Order, OrderStatus } from '../../../schema/order'

export interface IntacctOrder {
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

function mapStatus(state: IntacctOrder['STATE']): OrderStatus {
  if (state === 'Closed') return 'COMPLETED'
  if (state === 'Cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

export function transformOrder(raw: IntacctOrder): Order {
  return {
    id: raw.RECORDNO,
    type: 'SALES',
    status: mapStatus(raw.STATE),
    contactId: raw.CUSTOMERID || undefined,
    currency: raw.CURRENCY || undefined,
    totalAmount: parseFloat(raw.TOTAL),
    postedAt: raw.WHENORDERED ? new Date(raw.WHENORDERED) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
