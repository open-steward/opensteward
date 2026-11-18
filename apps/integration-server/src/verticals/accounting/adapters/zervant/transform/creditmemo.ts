import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface ZervantCreditMemo {
  id: string
  number?: string
  date?: string
  dueDate?: string
  total?: number
  taxTotal?: number
  status?: string
  contactId?: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(raw: ZervantCreditMemo): CreditMemoStatus {
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

export function transformCreditMemo(raw: ZervantCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.taxTotal,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
