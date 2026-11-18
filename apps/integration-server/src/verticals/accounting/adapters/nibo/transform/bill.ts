import type { Bill, BillStatus } from '../../../schema/bill'

export interface NiboBill {
  billId: number
  documentNumber: string
  supplierId: number
  issueDate: string
  dueDate: string
  totalValue: number
  taxValue: number
  balance: number
  currencyCode: string
  status: string
  isCancelled: boolean
  [key: string]: unknown
}

function mapStatus(raw: NiboBill): BillStatus {
  if (raw.isCancelled) return 'VOIDED'
  if (raw.status === 'Paid' || raw.balance === 0) return 'PAID'
  if (raw.balance > 0 && raw.balance < raw.totalValue) return 'PARTIALLY_PAID'
  if (raw.status === 'Authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: NiboBill): Bill {
  return {
    id: String(raw.billId),
    status: mapStatus(raw),
    billNumber: raw.documentNumber || undefined,
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalValue,
    taxAmount: raw.taxValue,
    balanceAmount: raw.balance,
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
