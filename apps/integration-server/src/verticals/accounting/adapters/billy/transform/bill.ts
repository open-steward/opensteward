import type { Bill, BillStatus } from '../../../schema/bill'

export interface BillyBill {
  id: string
  voucherNo: number
  contactId: string
  currencyId: string
  entryDate: string
  dueDate: string
  state: string
  grossAmount: number
  taxAmount: number
  balance: number
  paidAmount: number
  [key: string]: unknown
}

function mapStatus(bill: BillyBill): BillStatus {
  if (bill.state === 'voided') return 'VOIDED'
  if (bill.state === 'approved' && bill.balance === 0) return 'PAID'
  if (bill.state === 'approved' && bill.paidAmount > 0) return 'PARTIALLY_PAID'
  if (bill.state === 'approved') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: BillyBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.voucherNo ? String(raw.voucherNo) : undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currencyId || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    postedAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
