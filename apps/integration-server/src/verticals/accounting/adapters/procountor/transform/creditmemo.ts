import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface ProcountorCreditMemo {
  id: number
  invoiceNumber: number
  partnerId: number
  currency: string
  date: string
  dueDate: string
  sum: number
  vatAmount: number
  openSum: number
  paidSum: number
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'EMPTY':
    case 'UNFINISHED':
      return 'DRAFT'
    case 'APPROVED':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'PARTLYPAID':
      return 'PARTIALLY_PAID'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: ProcountorCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.invoiceNumber ? String(raw.invoiceNumber) : undefined,
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.openSum,
    paidAmount: raw.paidSum || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
