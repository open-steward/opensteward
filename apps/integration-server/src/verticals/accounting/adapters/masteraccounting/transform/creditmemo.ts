import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface MasteraccountingCreditMemo {
  id: string
  number: string
  date: string
  totalSum: number
  taxSum?: number
  status: string
  currency?: string
  partnerId?: string
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'APPROVED':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    case 'DRAFT':
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: MasteraccountingCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.partnerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalSum,
    taxAmount: raw.taxSum || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
