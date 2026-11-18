import type { Bill, BillStatus } from '../../../schema/bill'

export interface ProfitBooksBill {
  id: string
  bill_number: string
  contact_id: string
  currency: string
  total_amount: number
  tax_amount: number
  paid_amount: number
  balance_amount: number
  date: string
  due_date: string
  status: string
  [key: string]: unknown
}

function mapStatus(bill: ProfitBooksBill): BillStatus {
  const s = bill.status?.toLowerCase() ?? ''
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'approved') return 'AUTHORIZED'
  if (s === 'cancelled') return 'VOIDED'
  return 'DRAFT'
}

export function transformBill(raw: ProfitBooksBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.balance_amount,
    paidAmount: raw.paid_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
