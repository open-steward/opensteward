import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface EBoekhoudenCreditNote {
  id?: number | string
  invoiceNumber?: string
  relationId?: number | string
  totalInclTax?: number
  taxAmount?: number
  isPaid?: boolean
  isCancelled?: boolean
  date?: string
  dueDate?: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(raw: EBoekhoudenCreditNote): CreditMemoStatus {
  if (raw.isCancelled) return 'VOIDED'
  if (raw.isPaid) return 'PAID'
  return 'AUTHORIZED'
}

export function transformCreditMemo(raw: EBoekhoudenCreditNote): CreditMemo {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    creditmemoNumber: raw.invoiceNumber || undefined,
    contactId: raw.relationId !== undefined ? String(raw.relationId) : undefined,
    status: mapStatus(raw),
    totalAmount: raw.totalInclTax,
    taxAmount: raw.taxAmount,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
