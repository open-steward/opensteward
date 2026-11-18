import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface VismaBusinessNxtCreditMemo {
  id: string
  number?: string
  date?: string
  dueDate?: string
  grossAmount?: number
  taxAmount?: number
  status?: string
  customerId?: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(raw: VismaBusinessNxtCreditMemo): CreditMemoStatus {
  switch (raw.status) {
    case 'Open':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: VismaBusinessNxtCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.taxAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
