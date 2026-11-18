import type { Bill, BillStatus } from '../../../schema/bill'

export interface TwinfieldBill {
  code: string
  billNumber: string
  supplier: string
  currency: string
  invoiceDate: string
  dueDate: string
  status: string
  totalExcl: number
  totalIncl: number
  vatTotal: number
  paidAmount: number
  balance: number
  [key: string]: unknown
}

function mapStatus(bill: TwinfieldBill): BillStatus {
  const s = bill.status?.toLowerCase() ?? ''
  if (s === 'final' && bill.balance === 0) return 'PAID'
  if (s === 'final' && bill.paidAmount > 0) return 'PARTIALLY_PAID'
  if (s === 'final') return 'AUTHORIZED'
  if (s === 'concept') return 'DRAFT'
  if (s === 'voided' || s === 'deleted') return 'VOIDED'
  return 'DRAFT'
}

export function transformBill(raw: TwinfieldBill): Bill {
  return {
    id: raw.code,
    status: mapStatus(raw),
    billNumber: raw.billNumber || undefined,
    contactId: raw.supplier || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalIncl,
    taxAmount: raw.vatTotal,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
