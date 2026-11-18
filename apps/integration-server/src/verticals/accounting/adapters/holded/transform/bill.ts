import type { Bill, BillStatus } from '../../../schema/bill'

export interface HoldedBill {
  id: string
  invoiceNum: string
  contact: string
  currency: string
  subtotal: number
  tax: number
  total: number
  date: number
  dueDate: number
  status: number
  paid: number
  [key: string]: unknown
}

function mapStatus(bill: HoldedBill): BillStatus {
  // Holded status: 0 = draft, 1 = accepted/authorized, 2 = paid, 3 = overdue, 4 = voided
  if (bill.status === 4) return 'VOIDED'
  if (bill.status === 3) return 'OVERDUE'
  if (bill.status === 2) return 'PAID'
  if (bill.status === 1 && bill.paid > 0 && bill.paid < bill.total) return 'PARTIALLY_PAID'
  if (bill.status === 1) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: HoldedBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.invoiceNum || undefined,
    contactId: raw.contact || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    balanceAmount: raw.total - (raw.paid ?? 0),
    paidAmount: raw.paid || undefined,
    postedAt: raw.date ? new Date(raw.date * 1000) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
