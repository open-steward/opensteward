import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface TwinfieldCreditMemo {
  code: string
  creditNumber: string
  customer: string
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

function mapStatus(cm: TwinfieldCreditMemo): CreditMemoStatus {
  const s = cm.status?.toLowerCase() ?? ''
  if (s === 'final' && cm.balance === 0) return 'PAID'
  if (s === 'final' && cm.paidAmount > 0) return 'PARTIALLY_PAID'
  if (s === 'final') return 'AUTHORIZED'
  if (s === 'concept') return 'DRAFT'
  if (s === 'voided' || s === 'deleted') return 'VOIDED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: TwinfieldCreditMemo): CreditMemo {
  return {
    id: raw.code,
    status: mapStatus(raw),
    creditmemoNumber: raw.creditNumber || undefined,
    contactId: raw.customer || undefined,
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
