import type { Bill, BillStatus } from '../../../schema/bill'

export interface ZervantBill {
  id: string
  number?: string
  supplierId?: string
  date?: string
  dueDate?: string
  currency?: string
  total?: number
  taxTotal?: number
  amountDue?: number
  status?: string
  [key: string]: unknown
}

function mapStatus(raw: ZervantBill): BillStatus {
  switch (raw.status?.toUpperCase()) {
    case 'RECEIVED':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: ZervantBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.number || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.taxTotal,
    balanceAmount: raw.amountDue,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
