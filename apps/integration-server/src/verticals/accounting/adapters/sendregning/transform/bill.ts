import type { Bill, BillStatus } from '../../../schema/bill'

export interface SendRegningBill {
  id: string
  billNo?: string
  date?: string
  dueDate?: string
  totalExVat?: number
  totalVat?: number
  total?: number
  outstanding?: number
  status?: string
  currency?: string
  supplierId?: string
  [key: string]: unknown
}

function mapStatus(raw: SendRegningBill): BillStatus {
  switch (raw.status?.toLowerCase()) {
    case 'received':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: SendRegningBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.billNo || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.totalVat,
    balanceAmount: raw.outstanding,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
