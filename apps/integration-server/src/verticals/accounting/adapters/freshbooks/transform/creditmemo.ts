import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface FreshBooksCreditNote {
  id: number
  client_id: number
  credit_number: string
  date: string
  currency_code: string
  amount: { amount: string; code: string }
  balance: { amount: string; code: string }
  status: number
  [key: string]: unknown
}

function mapStatus(status: number): CreditMemoStatus {
  switch (status) {
    case 1: return 'DRAFT'
    case 4: return 'AUTHORIZED'
    case 10: return 'PAID'
    case 12: return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: FreshBooksCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_number || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount?.amount ? parseFloat(raw.amount.amount) : undefined,
    balanceAmount: raw.balance?.amount ? parseFloat(raw.balance.amount) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
