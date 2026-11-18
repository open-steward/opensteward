import type { Bill, BillStatus } from '../../../schema/bill'

export interface BillomatBill {
  id: string
  bill_number: string
  supplier_id: string
  currency_code: string
  date: string
  due_date: string
  status: string
  total_gross: number
  total_net: number
  tax_amount: number
  paid_amount: number
  open_amount: number
  [key: string]: unknown
}

function mapStatus(bill: BillomatBill): BillStatus {
  const s = bill.status?.toUpperCase()
  if (s === 'CANCELED' || s === 'CANCELLED') return 'VOIDED'
  if (s === 'PAID') return 'PAID'
  if (s === 'OVERDUE') return 'OVERDUE'
  if (s === 'OPEN' && bill.paid_amount > 0) return 'PARTIALLY_PAID'
  if (s === 'OPEN') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: BillomatBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_gross,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.open_amount,
    paidAmount: raw.paid_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
