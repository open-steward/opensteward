import type { Bill, BillStatus } from '../../../schema/bill'

export interface KashooBill {
  id: string
  bill_number: string
  contact_id: string
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  date: string
  due_date: string
  status: string
  paid_amount: number
  [key: string]: unknown
}

function mapStatus(bill: KashooBill): BillStatus {
  const s = bill.status?.toLowerCase()
  if (s === 'void') return 'VOIDED'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'paid') return 'PAID'
  if (s === 'sent' && bill.paid_amount > 0 && bill.paid_amount < bill.total) return 'PARTIALLY_PAID'
  if (s === 'sent') return 'SUBMITTED'
  return 'DRAFT'
}

export function transformBill(raw: KashooBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.total - (raw.paid_amount ?? 0),
    paidAmount: raw.paid_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
