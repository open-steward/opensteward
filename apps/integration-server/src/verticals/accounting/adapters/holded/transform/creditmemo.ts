import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface HoldedCreditMemo {
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

function mapStatus(cm: HoldedCreditMemo): CreditMemoStatus {
  // Holded status: 0 = draft, 1 = accepted/authorized, 2 = paid, 3 = overdue, 4 = voided
  if (cm.status === 4) return 'VOIDED'
  if (cm.status === 3) return 'AUTHORIZED'
  if (cm.status === 2) return 'PAID'
  if (cm.status === 1 && cm.paid > 0 && cm.paid < cm.total) return 'PARTIALLY_PAID'
  if (cm.status === 1) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: HoldedCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.invoiceNum || undefined,
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
