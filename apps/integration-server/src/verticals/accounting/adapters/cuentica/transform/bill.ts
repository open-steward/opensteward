import type { Bill, BillStatus } from '../../../schema/bill'

export interface CuenticaBill {
  id: string
  number: string
  date: string
  due_date: string
  subtotal: number
  tax: number
  total: number
  outstanding: number
  status: string
  contact_id: string
  currency: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: CuenticaBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    balanceAmount: raw.outstanding,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
