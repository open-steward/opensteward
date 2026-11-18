import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface MekariJurnalCreditMemo {
  id: number
  date: string
  total: number
  person_id: number | string | null
  status: string
  [key: string]: unknown
}

function mapCreditMemoStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'paid':
      return 'PAID'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'voided':
      return 'VOIDED'
    case 'open':
      return 'AUTHORIZED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: MekariJurnalCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapCreditMemoStatus(raw.status),
    contactId: raw.person_id != null ? String(raw.person_id) : undefined,
    totalAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
