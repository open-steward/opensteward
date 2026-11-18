import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface BillyCreditMemo {
  id: string
  invoiceNo: number
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

function mapStatus(cm: BillyCreditMemo): CreditMemoStatus {
  if (cm.state === 'voided') return 'VOIDED'
  if (cm.state === 'approved' && cm.balance === 0) return 'PAID'
  if (cm.state === 'approved' && cm.paidAmount > 0) return 'PARTIALLY_PAID'
  if (cm.state === 'approved') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: BillyCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.invoiceNo ? String(raw.invoiceNo) : undefined,
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
