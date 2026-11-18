import type { Bill, BillStatus } from '../../../schema/bill'

export interface CenterBill {
  id: string
  billNumber: string
  contactId: string
  currency: string
  subtotal: number
  taxAmount: number
  total: number
  date: string
  dueDate: string
  status: string
  paidAmount: number
  [key: string]: unknown
}

function mapStatus(bill: CenterBill): BillStatus {
  const s = bill.status?.toLowerCase() ?? ''
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'paid') return 'PAID'
  if ((s === 'sent' || s === 'submitted') && bill.paidAmount > 0 && bill.paidAmount < bill.total) return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'submitted') return 'SUBMITTED'
  return 'DRAFT'
}

export function transformBill(raw: CenterBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.billNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.total - (raw.paidAmount ?? 0),
    paidAmount: raw.paidAmount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
