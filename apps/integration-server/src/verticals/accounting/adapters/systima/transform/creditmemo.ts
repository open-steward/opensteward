import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface SystimaCreditMemo {
  id: string
  number?: string
  date?: string
  dueDate?: string
  totalAmount?: number
  vatAmount?: number
  status?: string
  customerId?: string
  [key: string]: unknown
}

function mapStatus(raw: SystimaCreditMemo): CreditMemoStatus {
  switch (raw.status?.toUpperCase()) {
    case 'ISSUED':
      return 'AUTHORIZED'
    case 'APPLIED':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: SystimaCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.customerId || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
