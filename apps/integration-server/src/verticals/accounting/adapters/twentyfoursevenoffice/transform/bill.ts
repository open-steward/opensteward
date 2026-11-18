import type { Bill, BillStatus } from '../../../schema/bill'

export interface TwentyFourSevenBill {
  id: string
  billNumber: number
  supplierId: string
  currency: string
  billDate: string
  dueDate: string
  status: string
  totalAmount: number
  taxAmount: number
  balance: number
  paidAmount: number
  [key: string]: unknown
}

function mapStatus(bill: TwentyFourSevenBill): BillStatus {
  if (bill.status === 'voided' || bill.status === 'cancelled') return 'VOIDED'
  if (bill.status === 'paid' || (bill.status === 'approved' && bill.balance === 0)) return 'PAID'
  if (bill.status === 'approved' && bill.paidAmount > 0) return 'PARTIALLY_PAID'
  if (bill.status === 'approved') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: TwentyFourSevenBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.billNumber ? String(raw.billNumber) : undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
