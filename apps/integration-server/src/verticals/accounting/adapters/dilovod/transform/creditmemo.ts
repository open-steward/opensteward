import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface DilovodCreditMemo {
  id: string
  number: string
  date: string
  total: number
  tax?: number
  status: string
  currency?: string
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'sent':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: DilovodCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.number || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
