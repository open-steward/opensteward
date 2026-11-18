import type { Bill, BillStatus } from '../../../schema/bill'

export interface WaveBill {
  id: string
  billNumber: string
  vendor: { id: string } | null
  currency: { code: string } | null
  totalAmount: number
  amountDue: number
  amountPaid: number
  dueDate: string
  invoiceDate: string
  status: string
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

function mapStatus(status: string, bill: WaveBill): BillStatus {
  const s = status.toUpperCase()
  if (s === 'PAID') return 'PAID'
  if (s === 'PARTIAL') return 'PARTIALLY_PAID'
  if (s === 'OVERDUE') return 'OVERDUE'
  if (s === 'SENT' || s === 'UNPAID' || s === 'VIEWED') return 'SUBMITTED'
  if (s === 'DRAFT') return 'DRAFT'
  if (bill.amountPaid > 0 && bill.amountPaid < bill.totalAmount) return 'PARTIALLY_PAID'
  return 'DRAFT'
}

export function transformBill(raw: WaveBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status, raw),
    billNumber: raw.billNumber || undefined,
    contactId: raw.vendor?.id || undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.totalAmount,
    balanceAmount: raw.amountDue,
    paidAmount: raw.amountPaid || undefined,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.modifiedAt ? new Date(raw.modifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
