import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface AccurateCreditMemo {
  id: number
  number: string
  status: string
  transactionDate: string
  totalAmount: number
  customerNo: string | null
  [key: string]: unknown
}

function mapCreditMemoStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Closed':
      return 'PAID'
    case 'Voided':
      return 'VOIDED'
    case 'Open':
      return 'AUTHORIZED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: AccurateCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapCreditMemoStatus(raw.status),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.customerNo || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
